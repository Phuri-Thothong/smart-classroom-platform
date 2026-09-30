import json
import threading
from contextlib import asynccontextmanager
from datetime import datetime, time, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import desc
from typing import Optional
import paho.mqtt.client as mqtt
from fastapi import FastAPI, Depends, Request, HTTPException, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import uvicorn

# --- Import Database Tools & Schemas ---
from database import engine, Base, SessionLocal, get_db
from models import Node, Room, Telemetry, AutomationRule, ClassSchedule
from schemas import RoomCreate, DeviceConfig, RuleCreate, ScheduleCreate

# =========================================================
# 1. CONFIGURATION & GLOBALS
# =========================================================
MQTT_BROKER = "broker.hivemq.com"
MQTT_PORT = 1883
PREFIX = "smart-classroom/psu_6610110598" 
MQTT_METADATA_TOPIC = f"{PREFIX}/nodes/+/metadata"
MQTT_CONFIG_TOPIC = f"{PREFIX}/nodes/{{}}/config"
MQTT_TELEMETRY_TOPIC = f"{PREFIX}/nodes/+/telemetry"
MQTT_COMMAND_TOPIC = f"{PREFIX}/nodes/{{}}/command"

gateway_statuses = {}
mqtt_client = None

# =========================================================
# 2. HELPER FUNCTIONS (Logic แยกย่อยเพื่อลดความยาว)
# =========================================================
def trigger_room_devices(db: Session, room_id: str, action: str):
    """ส่งคำสั่งเปิด/ปิด ไปยังอุปกรณ์ที่เป็น controller ทั้งหมดในห้อง"""
    devices = db.query(Node).filter(Node.room_id == room_id, Node.device_type.in_(["lighting", "air_control"])).all()
    for dev in devices:
        payload = {"type": "command", "payload": {"device_id": dev.node_id, "action": action}}
        if mqtt_client:
            mqtt_client.publish(MQTT_COMMAND_TOPIC.format(dev.node_id), json.dumps(payload))

def check_schedules_and_trigger():
    """ตรวจสอบตารางเรียนทุกนาที เพื่อสั่งเปิด/ปิดอุปกรณ์ในห้องอัตโนมัติ"""
    db = SessionLocal()
    try:
        now = datetime.now()
        current_day = (now.isoweekday() % 7) + 1 
        current_time_obj = now.time()
        todays_classes = db.query(ClassSchedule).filter(ClassSchedule.day_of_week == current_day).all()
        
        for cls in todays_classes:
            start_datetime = datetime.combine(now.date(), cls.start_time)
            pre_start_time = (start_datetime - timedelta(minutes=15)).time()
            if current_time_obj.hour == pre_start_time.hour and current_time_obj.minute == pre_start_time.minute:
                print(f"\n[Scheduler] Pre-start class '{cls.subject_code}' in Room {cls.room_id}. Turning ON devices...")
                trigger_room_devices(db, cls.room_id, "ON")
            if current_time_obj.hour == cls.end_time.hour and current_time_obj.minute == cls.end_time.minute:
                print(f"\n[Scheduler] End class '{cls.subject_code}' in Room {cls.room_id}. Turning OFF devices...")
                trigger_room_devices(db, cls.room_id, "OFF")
    finally:
        db.close()

# =========================================================
# 3. MQTT ENGINE
# =========================================================
def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        print("[Platform] Connected to MQTT Broker: Success")
        client.subscribe([(MQTT_METADATA_TOPIC, 0), (MQTT_TELEMETRY_TOPIC, 0), (f"{PREFIX}/gateways/+/status", 0)])
    else:
        print(f"[Platform] MQTT connection failed. Code: {reason_code}")

def on_message(client, userdata, msg):
    topic, payload = msg.topic, msg.payload.decode()
    if "/gateways/" in topic and topic.endswith("/status"):
        try:
            gateway_id = topic.split("/")[-2]
            gateway_statuses[gateway_id] = json.loads(payload).get("status", "offline")
        except Exception: pass
        return

    try:
        data = json.loads(payload)
        db = SessionLocal()
        try:
            # --- ONBOARDING (METADATA) ---
            if topic.endswith("/metadata"):
                room_id, device_id = data.get("room_id"), data.get("device_id")
                if room_id:
                    room = db.query(Room).filter(Room.room_id == room_id).first()
                    if not room:
                        db.add(Room(room_id=room_id, room_name=f"Room {room_id}"))
                        db.commit()

                node = db.query(Node).filter(Node.node_id == device_id).first()
                if not node:
                    db.add(Node(
                        node_id=device_id, room_id=room_id, gateway_id=data.get("gateway_id"),
                        device_type=data.get("device_type"), device_name=data.get("device_name"),
                        firmware_version=data.get("firmware_version"), capabilities=data.get("capabilities")
                    ))
                else:
                    node.room_id = room_id
                    node.gateway_id = data.get("gateway_id")
                db.commit()

            # --- SENSORS & AUTOMATION (TELEMETRY) ---
            elif topic.endswith("/telemetry"):
                device_id = data.get("device_id")
                node = db.query(Node).filter(Node.node_id == device_id).first()
                
                if not node:
                    reset_payload = {"type": "command", "payload": {"device_id": device_id, "action": "RESET"}}
                    client.publish(MQTT_COMMAND_TOPIC.format(device_id), json.dumps(reset_payload))
                    return

                node_timestamp = data.get("timestamp")
                if not node_timestamp or node_timestamp == "auto":
                    node_timestamp = datetime.now().isoformat()
                
                db.add(Telemetry(node_id=device_id, timestamp=node_timestamp, data=data.get("data")))
                db.commit()

                # Automation Engine Evaluation
                active_rules = db.query(AutomationRule).filter(AutomationRule.sensor_node_id == device_id, AutomationRule.is_active == True).all()
                sensor_values = data.get("data", {})
                for rule in active_rules:
                    if rule.sensor_key in sensor_values:
                        try:
                            val, thres = float(sensor_values[rule.sensor_key]), rule.condition_value
                            triggered = (
                                (rule.condition_operator == ">" and val > thres) or
                                (rule.condition_operator == "<" and val < thres) or
                                (rule.condition_operator == "==" and val == thres) or
                                (rule.condition_operator == "!=" and val != thres)
                            )
                            if triggered:
                                action_payload = {"type": "command", "payload": {"device_id": rule.target_node_id, "action": rule.action}}
                                client.publish(MQTT_COMMAND_TOPIC.format(rule.target_node_id), json.dumps(action_payload))
                                print(f"[Automation] Rule '{rule.name}' Triggered -> {rule.action} to {rule.target_node_id}")
                        except ValueError: pass
        finally:
            db.close() 
    except Exception as e:
        print(f"[Platform] Error processing message: {e}")

def start_mqtt():
    global mqtt_client
    mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    mqtt_client.on_connect, mqtt_client.on_message = on_connect, on_message
    try:
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
        mqtt_client.loop_forever()
    except Exception as e: print(f"[Platform] MQTT error: {e}")

# =========================================================
# 4. FASTAPI ROUTERS (จัดกลุ่ม API)
# =========================================================
api_router = APIRouter()

# --- ROOMS ---
@api_router.get("/rooms", tags=["Rooms"])
def get_rooms(db: Session = Depends(get_db)):
    return db.query(Room).all()

@api_router.post("/rooms", tags=["Rooms"])
def create_room(room: RoomCreate, db: Session = Depends(get_db)):
    if db.query(Room).filter(Room.room_id == room.room_id).first():
        raise HTTPException(status_code=400, detail="Room ID already exists")
    new_room = Room(room_id=room.room_id, room_name=room.room_name)
    db.add(new_room)
    db.commit()
    db.refresh(new_room)
    return new_room

@api_router.delete("/rooms/{room_id}", tags=["Rooms"])
def delete_room(room_id: str, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.room_id == room_id).first()
    if not room: raise HTTPException(status_code=404, detail="Room not found")
    db.query(Node).filter(Node.room_id == room_id).update({"room_id": None})
    db.delete(room)
    db.commit()
    return {"message": "Deleted"}

# --- DEVICES ---
@api_router.get("/devices", tags=["Devices"])
def get_devices(db: Session = Depends(get_db)):
    nodes = db.query(Node).all()
    result, current_time = [], datetime.utcnow()
    for node in nodes:
        caps = node.capabilities if isinstance(node.capabilities, dict) else (json.loads(node.capabilities) if isinstance(node.capabilities, str) else {})
        if isinstance(caps, str): caps = json.loads(caps)
        
        node_data = {
            "node_id": node.node_id, "room_id": node.room_id, "gateway_id": node.gateway_id,
            "device_type": node.device_type, "device_name": node.device_name,
            "status": node.status, "sampling_interval": caps.get("sampling_interval", 5),
            "telemetry_interval": caps.get("telemetry_interval", 10)
        }
        
        if node.status != "pending":
            latest_tel = db.query(Telemetry).filter(Telemetry.node_id == node.node_id).order_by(desc(Telemetry.timestamp)).first()
            if latest_tel and latest_tel.timestamp:
                try:
                    time_str = latest_tel.timestamp.replace("Z", "")
                    tel_time = datetime.fromisoformat(time_str) if isinstance(latest_tel.timestamp, str) else latest_tel.timestamp.replace(tzinfo=None)
                    node_data["status"] = "offline" if (current_time - tel_time).total_seconds() > 15 else "active"
                except Exception: node_data["status"] = "offline"
            else: node_data["status"] = "offline"
        result.append(node_data)
    return result

@api_router.get("/devices/{device_id}", tags=["Devices"])
def get_device_api(device_id: str, db: Session = Depends(get_db)):
    return db.query(Node).filter(Node.node_id == device_id).first() or {"error": "Not found"}

@api_router.post("/devices/{device_id}/approve", tags=["Devices"])
def approve_device_api(device_id: str, config: DeviceConfig, db: Session = Depends(get_db)):
    node = db.query(Node).filter(Node.node_id == device_id).first()
    if not node: raise HTTPException(status_code=404, detail="Device not found")
    
    node.status = "approved"
    if config.device_name: node.device_name = config.device_name
    if config.room_id: node.room_id = config.room_id
    
    caps = node.capabilities if isinstance(node.capabilities, dict) else {}
    caps.update({"sampling_interval": config.sampling_interval, "telemetry_interval": config.telemetry_interval})
    node.capabilities = caps 
    db.commit()
    
    config_data = {"device_id": device_id, "config_version": 1, **caps, "enabled": config.enabled}
    if mqtt_client: mqtt_client.publish(MQTT_CONFIG_TOPIC.format(device_id), json.dumps({"type": "config", "payload": config_data}))
    return {"device": node, "configuration": config_data}

@api_router.post("/devices/{device_id}/config", tags=["Devices"])
def update_device_config(device_id: str, config: DeviceConfig, db: Session = Depends(get_db)):
    # โครงสร้างทำงานเหมือน Approve แต่ข้ามการเปลี่ยน Status
    return approve_device_api(device_id, config, db)

@api_router.delete("/devices/{device_id}", tags=["Devices"])
def delete_device(device_id: str, db: Session = Depends(get_db)):
    device = db.query(Node).filter(Node.node_id == device_id).first()
    if not device: raise HTTPException(status_code=404)
    db.query(Telemetry).filter(Telemetry.node_id == device_id).delete()
    db.delete(device)
    db.commit()
    return {"message": "Deleted"}

@api_router.get("/devices/{device_id}/telemetry", tags=["Devices"])
def get_telemetry_api(device_id: str, limit: int = 10, db: Session = Depends(get_db)):
    return db.query(Telemetry).filter(Telemetry.node_id == device_id).order_by(desc(Telemetry.telemetry_id)).limit(limit).all()

@api_router.post("/devices/{device_id}/control", tags=["Devices"])
async def control_device_api(device_id: str, request: Request):
    body = await request.json()
    action = body.get("action", "OFF")
    if mqtt_client: mqtt_client.publish(MQTT_COMMAND_TOPIC.format(device_id), json.dumps({"type": "command", "payload": {"device_id": device_id, "action": action}}))
    return {"status": "success"}

# --- GATEWAYS & AUTOMATION ---
@api_router.get("/gateways/status", tags=["Gateways"])
def get_gateway_status(db: Session = Depends(get_db)):
    active = db.query(Node.gateway_id).distinct().all()
    return {gw_id: gateway_statuses.get(gw_id, "offline") for (gw_id,) in active if gw_id} | gateway_statuses

@api_router.get("/rules", tags=["Automation"])
def get_rules(db: Session = Depends(get_db)): return db.query(AutomationRule).all()

@api_router.post("/rules", tags=["Automation"])
def create_rule(rule: RuleCreate, db: Session = Depends(get_db)):
    db_rule = AutomationRule(**rule.dict())
    db.add(db_rule)
    db.commit()
    return db_rule

@api_router.delete("/rules/{rule_id}", tags=["Automation"])
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    db.query(AutomationRule).filter(AutomationRule.rule_id == rule_id).delete()
    db.commit()
    return {"status": "success"}

@api_router.get("/schedules", tags=["Automation"])
def get_schedules(db: Session = Depends(get_db)): return db.query(ClassSchedule).all()

@api_router.post("/schedules", tags=["Automation"])
def create_schedule(schedule: ScheduleCreate, db: Session = Depends(get_db)):
    db_schedule = ClassSchedule(**schedule.dict(exclude={'start_time', 'end_time'}), 
                                start_time=datetime.strptime(schedule.start_time, "%H:%M:%S").time(),
                                end_time=datetime.strptime(schedule.end_time, "%H:%M:%S").time())
    db.add(db_schedule)
    db.commit()
    return db_schedule

@api_router.delete("/schedules/{schedule_id}", tags=["Automation"])
def delete_schedule(schedule_id: int, db: Session = Depends(get_db)):
    db.query(ClassSchedule).filter(ClassSchedule.id == schedule_id).delete()
    db.commit()
    return {"status": "success"}

# =========================================================
# 5. APP INITIALIZATION & LIFESPAN
# =========================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    threading.Thread(target=start_mqtt, daemon=True).start()
    scheduler = BackgroundScheduler()
    scheduler.add_job(check_schedules_and_trigger, 'cron', minute='*')
    scheduler.start()
    yield 
    scheduler.shutdown()

app = FastAPI(title="Smart Classroom Platform", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/", tags=["Core"])
def root(): return {"status": "running"}

app.include_router(api_router)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
    