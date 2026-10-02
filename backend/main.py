import json
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
import paho.mqtt.client as mqtt
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import uvicorn

# --- Import Database Tools & Shared Variables ---
from database import engine, Base, SessionLocal
from models import Node, Room, Telemetry, AutomationRule, ClassSchedule
import mqtt_shared

# --- Import Routers ---
from routers import rooms, devices, gateways, automation

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

def check_schedules_and_trigger():
    db = SessionLocal()
    try:
        now = datetime.now()
        current_day = (now.isoweekday() % 7) + 1 
        current_time_obj = now.time()
        
        todays_classes = db.query(ClassSchedule).filter(ClassSchedule.day_of_week == current_day).all()
        
        for cls in todays_classes:
            start_datetime = datetime.combine(now.date(), cls.start_time)
            pre_start_time = (start_datetime - timedelta(minutes=1)).time()
            if current_time_obj.hour == pre_start_time.hour and current_time_obj.minute == pre_start_time.minute:
                print(f"[Scheduler] 15-Min Pre-cool for {cls.subject_code} in {cls.room_id}")
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
        client.subscribe([(mqtt_shared.MQTT_METADATA_TOPIC, 0), (mqtt_shared.MQTT_TELEMETRY_TOPIC, 0), (f"{mqtt_shared.PREFIX}/gateways/+/status", 0)])

def on_message(client, userdata, msg):
    topic, payload = msg.topic, msg.payload.decode()
    if "/gateways/" in topic and topic.endswith("/status"):
        try:
            gateway_id = topic.split("/")[-2]
            mqtt_shared.gateway_statuses[gateway_id] = json.loads(payload).get("status", "offline")
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
                else:
                    node.room_id, node.gateway_id = room_id, data.get("gateway_id")
                db.commit()

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
                            client.publish(
                                mqtt_shared.MQTT_COMMAND_TOPIC.format(rule.target_node_id), 
                                json.dumps({"type": "command", "payload": {"device_id": rule.target_node_id, "action": rule.action}})
                            )
                            print(f"[Rule Engine] Triggered: {device_id} -> {rule.target_node_id} ({rule.action})")
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

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
    