import logging
import os
import json
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
import paho.mqtt.client as mqtt
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func
import uvicorn

# --- Import Database Tools & Shared Variables ---
from database import engine, Base, SessionLocal, get_db
from models import Node, Room, Telemetry, AutomationRule, ClassSchedule, SystemLog
import mqtt_shared

# --- Import Routers ---
from routers import rooms, devices, gateways, automation

# --- โหลดค่า Configuration จาก .env ---
PRE_COOL_MINUTES = int(os.getenv("PRE_COOL_MINUTES", 15))
NODE_TIMEOUT_MIN_GRACE = int(os.getenv("NODE_TIMEOUT_MIN_GRACE", 45))
NODE_MONITOR_INTERVAL = int(os.getenv("NODE_MONITOR_INTERVAL", 30))

node_online_states = {}

# --- ตั้งค่า Logging เพื่อเขียน Log จากฮาร์ดแวร์ลงไฟล์ gateway_flow.log ---
log_file_path = os.path.join(os.path.dirname(__file__), "..", "simulation", "virtual_gateway", "gateway_flow.log")
os.makedirs(os.path.dirname(log_file_path), exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s.%(msecs)03d | %(levelname)-7s | %(message)s',
    datefmt='%H:%M:%S',
    handlers=[
        logging.FileHandler(log_file_path, mode='a', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
hw_logger = logging.getLogger("HardwareGateway")
logging.getLogger("apscheduler").setLevel(logging.WARNING)

# =========================================================
# 1. HELPER FUNCTIONS & SCHEDULER
# =========================================================
def trigger_room_devices(db: Session, room_id: str, action: str, device_type_filter: list = None):
    query = db.query(Node).filter(Node.room_id == room_id)
    if device_type_filter:
        query = query.filter(Node.device_type.in_(device_type_filter))
    else:
        query = query.filter(Node.device_type.in_(["lighting", "air_control"]))
        
    devices_in_room = query.all()
    for dev in devices_in_room:
        payload = {"type": "command", "payload": {"device_id": dev.node_id, "action": action}}
        if mqtt_shared.mqtt_client:
            mqtt_shared.mqtt_client.publish(mqtt_shared.MQTT_COMMAND_TOPIC.format(dev.node_id), json.dumps(payload))
            print(f"[Scheduler] Published {action} to {dev.node_id} ({dev.device_type}) in {room_id}")

            db.add(SystemLog(
                source="SCHEDULE", 
                log_type="ACTION", 
                message=f"Triggered {action} for {dev.device_name or dev.node_id} in {room_id}"
            ))
            
    if devices_in_room:
        db.commit()

def monitor_node_health():
    db = SessionLocal()
    try:
        current_time = datetime.utcnow()
        nodes = db.query(Node).filter(Node.status == "approved").all()
        if not nodes:
            return
        latest_tels = db.query(
            Telemetry.node_id,
            func.max(Telemetry.timestamp).label('latest_time')
        ).group_by(Telemetry.node_id).all()
        latest_time_map = {row.node_id: row.latest_time for row in latest_tels}
        for node in nodes:
            is_online = False
            latest_timestamp = latest_time_map.get(node.node_id)
            caps = node.capabilities if isinstance(node.capabilities, dict) else (json.loads(node.capabilities) if isinstance(node.capabilities, str) else {})
            if isinstance(caps, str): 
                try: caps = json.loads(caps)
                except: caps = {}
            tel_interval = caps.get("telemetry_interval", 10)
            timeout_threshold = max(NODE_TIMEOUT_MIN_GRACE, tel_interval * 3)
            if latest_timestamp:
                try:
                    time_str = latest_timestamp.replace("Z", "")
                    tel_time = datetime.fromisoformat(time_str) if isinstance(latest_timestamp, str) else latest_timestamp.replace(tzinfo=None)
                    diff_utc = abs((datetime.utcnow() - tel_time).total_seconds())
                    diff_local = abs((datetime.now() - tel_time).total_seconds())
                    actual_diff = min(diff_utc, diff_local)
                    
                    if actual_diff <= timeout_threshold:
                        is_online = True
                except Exception: 
                    pass
            gw_status = mqtt_shared.gateway_statuses.get(node.gateway_id, "offline")
            if gw_status != "online":
                is_online = False
            old_state = node_online_states.get(node.node_id)
            if old_state is True and not is_online:
                db.add(SystemLog(source="SYSTEM", log_type="WARN", message=f"Node {node.node_id} went OFFLINE (Timeout > {timeout_threshold}s)"))
            elif old_state is False and is_online:
                db.add(SystemLog(source="SYSTEM", log_type="INFO", message=f"Node {node.node_id} is back ONLINE (Receiving Data)"))
            node_online_states[node.node_id] = is_online
        db.commit()
            
    except Exception as e:
        pass
    finally:
        db.close()

def check_schedules_and_trigger():
    db = SessionLocal()
    try:
        now = datetime.now()
        current_day = (now.isoweekday() % 7) + 1 
        current_time_obj = now.time()
        
        todays_classes = db.query(ClassSchedule).filter(ClassSchedule.day_of_week == current_day).all()
        
        for cls in todays_classes:
            start_datetime = datetime.combine(now.date(), cls.start_time)
            pre_start_time = (start_datetime - timedelta(minutes=PRE_COOL_MINUTES)).time()
            if current_time_obj.hour == pre_start_time.hour and current_time_obj.minute == pre_start_time.minute:
                print(f"[Scheduler] {PRE_COOL_MINUTES}-Min Pre-cool for {cls.subject_code} in {cls.room_id}")
                trigger_room_devices(db, cls.room_id, "ON", ["air_control"])

            if current_time_obj.hour == cls.start_time.hour and current_time_obj.minute == cls.start_time.minute:
                print(f"[Scheduler] Class Started: {cls.subject_code} in {cls.room_id}")
                trigger_room_devices(db, cls.room_id, "ON", ["lighting"])

            if current_time_obj.hour == cls.end_time.hour and current_time_obj.minute == cls.end_time.minute:
                print(f"[Scheduler] Class Ended: {cls.subject_code} in {cls.room_id}. Turning off devices.")
                trigger_room_devices(db, cls.room_id, "OFF", ["lighting", "air_control"])
    finally:
        db.close()

# =========================================================
# 2. MQTT ENGINE
# =========================================================
def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        print("[Platform] Connected to MQTT Broker: Success")
        client.subscribe([
            (mqtt_shared.MQTT_METADATA_TOPIC, 0), 
            (mqtt_shared.MQTT_TELEMETRY_TOPIC, 0), 
            (f"{mqtt_shared.PREFIX}/gateways/+/status", 0),
            (f"{mqtt_shared.PREFIX}/gateways/+/log", 0)
        ])

def on_message(client, userdata, msg):
    topic, payload = msg.topic, msg.payload.decode()
    if "/gateways/" in topic and topic.endswith("/status"):
        try:
            gateway_id = topic.split("/")[-2]
            new_status = json.loads(payload).get("status", "offline")
            old_status = mqtt_shared.gateway_statuses.get(gateway_id)
            if old_status != new_status:
                db = SessionLocal()
                try:
                    log_type = "INFO" if new_status == "online" else "ERROR"
                    db.add(SystemLog(
                        source="SYSTEM", 
                        log_type=log_type, 
                        message=f"Gateway {gateway_id} is now {new_status.upper()}"
                    ))
                    db.commit()
                finally:
                    db.close()
            mqtt_shared.gateway_statuses[gateway_id] = new_status
        except Exception: pass
        return

    try:
        data = json.loads(payload)
        db = SessionLocal()
        try:
            if topic.endswith("/metadata"):
                room_id, device_id = data.get("room_id"), data.get("device_id")
                if room_id:
                    if not db.query(Room).filter(Room.room_id == room_id).first():
                        db.add(Room(room_id=room_id, room_name=f"Room {room_id}"))
                        db.commit()

                node = db.query(Node).filter(Node.node_id == device_id).first()
                if not node:
                    db.add(Node(node_id=device_id, room_id=room_id, gateway_id=data.get("gateway_id"), device_type=data.get("device_type"), device_name=data.get("device_name"), firmware_version=data.get("firmware_version"), capabilities=data.get("capabilities")))
                    db.add(SystemLog(source="SYSTEM", log_type="INFO", message=f"New device {device_id} ({data.get('device_type')}) detected via {data.get('gateway_id')}"))
                else:
                    node.room_id, node.gateway_id = room_id, data.get("gateway_id")
                    db.add(SystemLog(source="SYSTEM", log_type="INFO", message=f"Node {device_id} booted and came ONLINE"))
                db.commit()
                node_online_states[device_id] = True

            elif topic.endswith("/telemetry"):
                device_id = data.get("device_id")
                if not db.query(Node).filter(Node.node_id == device_id).first():
                    client.publish(mqtt_shared.MQTT_COMMAND_TOPIC.format(device_id), json.dumps({"type": "command", "payload": {"device_id": device_id, "action": "RESET"}}))
                    return

                node_timestamp = data.get("timestamp") if data.get("timestamp") and data.get("timestamp") != "auto" else datetime.now().isoformat()
                db.add(Telemetry(node_id=device_id, timestamp=node_timestamp, data=data.get("data")))
                db.commit()

                active_rules = db.query(AutomationRule).filter(AutomationRule.sensor_node_id == device_id, AutomationRule.is_active == True).all()
                sensor_values = data.get("data", {})
                current_time = datetime.utcnow()
                for rule in active_rules:
                    if rule.sensor_key in sensor_values:
                        val = sensor_values[rule.sensor_key]
                        thres = rule.condition_value
                        trigger = False
                        
                        try:
                            if rule.condition_operator == "==" and str(val).upper() == str(thres).upper():
                                trigger = True
                            elif rule.condition_operator != "==":
                                val_f = float(val)
                                thres_f = float(thres)
                                if rule.condition_operator == ">" and val_f > thres_f: trigger = True
                                elif rule.condition_operator == "<" and val_f < thres_f: trigger = True
                                elif rule.condition_operator == "!=" and val_f != thres_f: trigger = True
                        except ValueError:
                            pass
                        
                        if trigger:
                            target_node = db.query(Node).filter(Node.node_id == rule.target_node_id).first()
                            if not target_node or target_node.status == "pending":
                                continue
                            
                            is_target_online = False
                            latest_tel = db.query(Telemetry).filter(Telemetry.node_id == rule.target_node_id).order_by(Telemetry.telemetry_id.desc()).first()
                            
                            if latest_tel and latest_tel.timestamp:
                                try:
                                    time_str = latest_tel.timestamp.replace("Z", "")
                                    tel_time = datetime.fromisoformat(time_str) if isinstance(latest_tel.timestamp, str) else latest_tel.timestamp.replace(tzinfo=None)
                                    diff_utc = abs((datetime.utcnow() - tel_time).total_seconds())
                                    diff_local = abs((datetime.now() - tel_time).total_seconds())
                                    actual_diff = min(diff_utc, diff_local)
                                    
                                    if actual_diff <= 45:
                                        is_target_online = True
                                except Exception:
                                    pass

                            gw_status = mqtt_shared.gateway_statuses.get(target_node.gateway_id, "offline")
                            if gw_status != "online":
                                is_target_online = False
                                
                            if is_target_online:
                                # --- เพิ่มระบบป้องกันการสั่งงานซ้ำซ้อน ---
                                target_current_state = "OFF"
                                if latest_tel and latest_tel.data:
                                    t_data = latest_tel.data
                                    if isinstance(t_data, str):
                                        try: t_data = json.loads(t_data)
                                        except: t_data = {}
                                    if isinstance(t_data, dict):
                                        target_current_state = t_data.get("status", "OFF")
                                # เช็กว่าสถานะใหม่ตรงกับสถานะเดิมหรือไม่ ถ้าไม่ตรงถึงจะสั่ง Publish
                                if str(target_current_state).upper() != str(rule.action).upper():
                                    client.publish(
                                        mqtt_shared.MQTT_COMMAND_TOPIC.format(rule.target_node_id), 
                                        json.dumps({"type": "command", "payload": {"device_id": rule.target_node_id, "action": rule.action}})
                                    )
                                    print(f"[Rule Engine] Triggered: {device_id} -> {rule.target_node_id} ({rule.action})")
                                    db.add(SystemLog(
                                        source="RULE", 
                                        log_type="ACTION", 
                                        message=f"Rule '{rule.name}' turned {rule.action} {rule.target_node_id}"
                                    ))
                                    db.commit()
            elif topic.endswith("/log"):
                gateway_id = topic.split("/")[-2]
                level = data.get("level", "INFO").upper()
                msg = data.get("msg", "")
                if level == "WARN" or level == "ERROR":
                    hw_logger.warning(f"[{gateway_id}] {msg}")
                else:
                    hw_logger.info(f"[{gateway_id}] {msg}")
        finally:
            db.close() 
    except Exception as e: pass

def start_mqtt():
    mqtt_shared.mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    mqtt_shared.mqtt_client.on_connect, mqtt_shared.mqtt_client.on_message = on_connect, on_message
    try:
        mqtt_shared.mqtt_client.connect(mqtt_shared.MQTT_BROKER, mqtt_shared.MQTT_PORT, 60)
        mqtt_shared.mqtt_client.loop_forever()
    except Exception: pass

# =========================================================
# 3. APP INITIALIZATION & LIFESPAN
# =========================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    threading.Thread(target=start_mqtt, daemon=True).start()
    scheduler = BackgroundScheduler()
    scheduler.add_job(check_schedules_and_trigger, 'cron', minute='*')
    scheduler.add_job(monitor_node_health, 'interval', seconds=NODE_MONITOR_INTERVAL)
    scheduler.start()
    yield 
    scheduler.shutdown()

app = FastAPI(title="Smart Classroom Platform", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/", tags=["Core"])
def root(): return {"status": "running"}

# --- Include Routers ---
app.include_router(rooms.router)
app.include_router(devices.router)
app.include_router(gateways.router)
app.include_router(automation.router)

@app.get("/logs", tags=["Logs"])
def get_system_logs(limit: int = 50, db: Session = Depends(get_db)):
    return db.query(SystemLog).order_by(SystemLog.id.desc()).limit(limit).all()

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
