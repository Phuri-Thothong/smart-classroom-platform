import json
import threading
from contextlib import asynccontextmanager
from datetime import datetime
from sqlalchemy import desc
from pydantic import BaseModel
import paho.mqtt.client as mqtt
from fastapi import FastAPI, Depends, Request, HTTPException
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
gateway_statuses = {}
mqtt_client = None

# --- Pydantic Schema ---
class RoomCreate(BaseModel):
    room_id: str
    room_name: str

# =========================================================
# MQTT Callbacks (VERSION 2)
# =========================================================
def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code == 0:
        print("[Platform] Connected to MQTT Broker: Success")
        client.subscribe(MQTT_METADATA_TOPIC)
        client.subscribe(MQTT_TELEMETRY_TOPIC)
        client.subscribe(f"{PREFIX}/gateways/+/status")
    else:
        print(f"[Platform] MQTT connection failed. Code: {reason_code}")

def on_message(client, userdata, msg):
    topic = msg.topic
    payload = msg.payload.decode()
    if "/gateways/" in topic and topic.endswith("/status"):
        try:
            data = json.loads(payload)
            gateway_id = topic.split("/")[-2]
            gateway_statuses[gateway_id] = data.get("status", "offline")
            print(f"[Gateway Status] {gateway_id} is now {gateway_statuses[gateway_id]}")
        except Exception as e:
            print(f"Error parsing gateway status: {e}")
        return
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
def get_devices(db: Session = Depends(get_db)):
    nodes = db.query(Node).all()
    result = []
    current_time = datetime.utcnow()
    for node in nodes:
        node_data = {
            "node_id": node.node_id,
            "room_id": node.room_id,
            "gateway_id": node.gateway_id,
            "device_type": node.device_type,
            "device_name": node.device_name,
            "firmware_version": node.firmware_version,
            "status": node.status,
        }
        if node.status != "pending":
            latest_tel = db.query(Telemetry).filter(Telemetry.node_id == node.node_id).order_by(desc(Telemetry.timestamp)).first()
            if latest_tel and latest_tel.timestamp:
                try:
                    # ตรวจสอบว่าเป็น String หรือไม่ ถ้าใช่ให้แปลงกลับเป็น datetime ก่อน
                    if isinstance(latest_tel.timestamp, str):
                        # แปลงจากรูปแบบ ISO 8601 (เช่น "2026-09-23T15:30:00Z")
                        time_str = latest_tel.timestamp.replace("Z", "")
                        tel_time = datetime.fromisoformat(time_str)
                    else:
                        tel_time = latest_tel.timestamp.replace(tzinfo=None)
                    time_diff = current_time - tel_time
                    if time_diff.total_seconds() > 15:
                        node_data["status"] = "offline"
                    else:
                        node_data["status"] = "active"
                except Exception as e:
                    print(f"Error parsing timestamp for node {node.node_id}: {e}")
                    node_data["status"] = "offline"
            else:
                node_data["status"] = "offline"
        result.append(node_data)
    return result

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

    config_data = {
        "device_id": device_id,
        "config_version": 1,
        "sampling_interval": 5,
        "telemetry_interval": 10,
        "enabled": True
    }

    payload = {
        "type": "config",
        "payload": config_data
    }
    
    topic = MQTT_CONFIG_TOPIC.format(device_id)
    if mqtt_client:
        mqtt_client.publish(topic, json.dumps(payload))
        print(f"\n[Platform] Configuration sent to {topic}")
    return {"device": node, "configuration": config_data}

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

@app.post("/rooms")
def create_room(room: RoomCreate, db: Session = Depends(get_db)):
    existing_room = db.query(Room).filter(Room.room_id == room.room_id).first()
    if existing_room:
        raise HTTPException(status_code=400, detail="Room ID already exists")
    
    new_room = Room(
        room_id=room.room_id,
        room_name=room.room_name
    )
    db.add(new_room)
    db.commit()
    db.refresh(new_room)
    return {"message": f"Room {room.room_id} created successfully"}

@app.delete("/devices/{device_id}")
def delete_device(device_id: str, db: Session = Depends(get_db)):
    device = db.query(Node).filter(Node.node_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    db.query(Telemetry).filter(Telemetry.node_id == device_id).delete()
    db.delete(device)
    db.commit()
    return {"message": f"Device {device_id} deleted successfully"}

@app.get("/gateways/status")
def get_gateway_status(db: Session = Depends(get_db)):
    active_gateways = db.query(Node.gateway_id).distinct().all()
    response_statuses = {}
    for (gw_id,) in active_gateways:
        if gw_id:
            response_statuses[gw_id] = gateway_statuses.get(gw_id, "offline")
    for gw_id, status in gateway_statuses.items():
        response_statuses[gw_id] = status
    return response_statuses

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
    