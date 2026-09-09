import json
import threading
from contextlib import asynccontextmanager
import datetime

import paho.mqtt.client as mqtt
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import uvicorn

# --- Import Database Tools ---
from database import engine, Base, SessionLocal, get_db
from models import Node, Room, Telemetry

# =========================================================
# MQTT Configuration
# =========================================================
MQTT_BROKER = "broker.hivemq.com"
MQTT_PORT = 1883
PREFIX = "smart-classroom/psu_6610110598" 
MQTT_METADATA_TOPIC = f"{PREFIX}/nodes/+/metadata"
MQTT_CONFIG_TOPIC = f"{PREFIX}/nodes/{{}}/config"
MQTT_TELEMETRY_TOPIC = f"{PREFIX}/nodes/+/telemetry"
MQTT_COMMAND_TOPIC = f"{PREFIX}/nodes/{{}}/command"

mqtt_client = None

# =========================================================
# MQTT Callbacks (VERSION 2)
# =========================================================
def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        print("[Platform] Connected to MQTT Broker: Success")
        client.subscribe(MQTT_METADATA_TOPIC)
        client.subscribe(MQTT_TELEMETRY_TOPIC)
    else:
        print(f"[Platform] MQTT connection failed. Code: {reason_code}")

def on_message(client, userdata, msg):
    print(f"\n[Platform] Received MQTT message on {msg.topic}")
    
    try:
        data = json.loads(msg.payload.decode())
        db = SessionLocal()
        try:
            # 1. จัดการ Metadata (Onboarding)
            if msg.topic.endswith("/metadata"):
                print(f"[Platform] Processing Metadata for {data.get('device_id')}")
                
                room_id = data.get("room_id")
                if room_id:
                    room = db.query(Room).filter(Room.room_id == room_id).first()
                    if not room:
                        room = Room(room_id=room_id, room_name=f"Room {room_id}")
                        db.add(room)
                        db.commit()

                device_id = data.get("device_id")
                node = db.query(Node).filter(Node.node_id == device_id).first()
                if not node:
                    node = Node(
                        node_id=device_id,
                        room_id=room_id,
                        gateway_id=data.get("gateway_id"),
                        device_type=data.get("device_type"),
                        device_name=data.get("device_name"),
                        firmware_version=data.get("firmware_version"),
                        capabilities=data.get("capabilities")
                    )
                    db.add(node)
                else:
                    node.room_id = room_id
                    node.gateway_id = data.get("gateway_id")
                db.commit()
                print(f"[Platform] => Saved Node '{device_id}' to Database!")

            # 2. จัดการ Telemetry
            elif msg.topic.endswith("/telemetry"):
                device_id = data.get("device_id")
                print(f"[Platform] Processing Telemetry for {device_id}")

                # เช็กว่ามี Node นี้ในระบบหรือไม่
                node = db.query(Node).filter(Node.node_id == device_id).first()
                if not node:
                    print(f"[Platform] WARNING: Unknown Node '{device_id}'. Sending RESET command.")
                    # ส่งคำสั่ง RESET ไปให้โหนดเพื่อบังคับลงทะเบียนใหม่
                    reset_payload = {
                        "type": "command",
                        "payload": {
                            "device_id": device_id,
                            "action": "RESET"
                        }
                    }
                    client.publish(MQTT_COMMAND_TOPIC.format(device_id), json.dumps(reset_payload))
                    return # ข้ามการบันทึกข้อมูลและจบการทำงานรอบนี้

                # เช็กถ้า Node ส่งมาเป็น "auto" ให้ Backend ประทับเวลาของ Server แทน
                node_timestamp = data.get("timestamp")
                if not node_timestamp or node_timestamp == "auto":
                    node_timestamp = datetime.datetime.now().isoformat()
                
                telemetry = Telemetry(
                    node_id=data.get("device_id"),
                    timestamp=node_timestamp,
                    data=data.get("data")
                )
                db.add(telemetry)
                db.commit()
                print(f"[Platform] => Saved Telemetry data to Database! ({data.get('data')})")

        finally:
            db.close() 

    except Exception as e:
        print(f"[Platform] Error processing message: {e}")

def start_mqtt():
    global mqtt_client
    mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    mqtt_client.on_connect = on_connect
    mqtt_client.on_message = on_message

    try:
        mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
        mqtt_client.loop_forever()
    except Exception as e:
        print(f"[Platform] MQTT error: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[Platform] Initializing Database Tables...")
    Base.metadata.create_all(bind=engine)
    print("[Platform] Starting MQTT service via Lifespan...")
    threading.Thread(target=start_mqtt, daemon=True).start()
    yield 

app = FastAPI(title="Smart Classroom Platform", version="1.0.0", lifespan=lifespan)

# =========================================================
# CORS Middleware (เตรียมพร้อมสำหรับ Web App)
# =========================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# REST API (เชื่อมต่อกับ Database และ MQTT)
# =========================================================

@app.get("/")
def root(): 
    return {"status": "running"}

@app.get("/devices")
def get_all_devices_api(db: Session = Depends(get_db)):
    """ดึงข้อมูล Node ทั้งหมดจาก Database"""
    return db.query(Node).all()

@app.get("/devices/{device_id}")
def get_device_api(device_id: str, db: Session = Depends(get_db)):
    """ดึงข้อมูล Node แบบระบุ ID"""
    node = db.query(Node).filter(Node.node_id == device_id).first()
    if not node:
        return {"error": "Device not found"}
    return node

@app.post("/devices/{device_id}/approve")
def approve_device_api(device_id: str, db: Session = Depends(get_db)):
    """อนุมัติอุปกรณ์และส่ง Configuration ผ่าน MQTT"""
    node = db.query(Node).filter(Node.node_id == device_id).first()
    if not node:
        return {"error": "Device not found"}
    
    node.status = "approved"
    db.commit()
    db.refresh(node)
    
    config = {
        "device_id": device_id,
        "config_version": 1,
        "sampling_interval": 5,
        "telemetry_interval": 10,
        "enabled": True
    }
    
    topic = MQTT_CONFIG_TOPIC.format(device_id)
    if mqtt_client:
        mqtt_client.publish(topic, json.dumps(config))
        print(f"\n[Platform] Configuration sent to {topic}")
    
    return {"device": node, "configuration": config}

@app.get("/devices/{device_id}/telemetry")
def get_telemetry_api(device_id: str, limit: int = 10, db: Session = Depends(get_db)):
    """ดึงข้อมูล Telemetry ย้อนหลังของอุปกรณ์"""
    records = db.query(Telemetry).filter(Telemetry.node_id == device_id)\
                .order_by(Telemetry.telemetry_id.desc()).limit(limit).all()
    return records

@app.post("/devices/{device_id}/control")
async def control_device_api(device_id: str, request: Request):
    """รับคำสั่งควบคุมอุปกรณ์จาก Web UI และส่งผ่าน MQTT"""
    body = await request.json()
    action = body.get("action", "OFF")
    
    payload = {
        "type": "command",
        "payload": {
            "device_id": device_id,
            "action": action
        }
    }
    
    topic = MQTT_COMMAND_TOPIC.format(device_id)
    if mqtt_client:
        mqtt_client.publish(topic, json.dumps(payload))
        print(f"\n[Platform] Command '{action}' sent to {topic}")
        
    return {"status": "success", "message": f"Command {action} sent to {device_id}"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
    