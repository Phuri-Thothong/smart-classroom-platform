import json
from datetime import datetime
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from database import get_db
from models import Node, Telemetry
from schemas import DeviceConfig
import mqtt_shared

router = APIRouter(prefix="/devices", tags=["Devices"])

@router.get("")
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
            latest_tel = db.query(Telemetry).filter(Telemetry.node_id == node.node_id).order_by(desc(Telemetry.telemetry_id)).first()
            if latest_tel and latest_tel.timestamp:
                try:
                    time_str = latest_tel.timestamp.replace("Z", "")
                    tel_time = datetime.fromisoformat(time_str) if isinstance(latest_tel.timestamp, str) else latest_tel.timestamp.replace(tzinfo=None)
                    node_data["status"] = "offline" if (current_time - tel_time).total_seconds() > 15 else "active"
                except Exception: node_data["status"] = "offline"
            else: node_data["status"] = "offline"
        result.append(node_data)
    return result

@router.get("/{device_id}")
def get_device_api(device_id: str, db: Session = Depends(get_db)):
    return db.query(Node).filter(Node.node_id == device_id).first() or {"error": "Not found"}

@router.post("/{device_id}/approve")
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
    if mqtt_shared.mqtt_client: 
        mqtt_shared.mqtt_client.publish(mqtt_shared.MQTT_CONFIG_TOPIC.format(device_id), json.dumps({"type": "config", "payload": config_data}))
    return {"device": node, "configuration": config_data}

@router.post("/{device_id}/config")
def update_device_config(device_id: str, config: DeviceConfig, db: Session = Depends(get_db)):
    return approve_device_api(device_id, config, db)

@router.delete("/{device_id}")
def delete_device(device_id: str, db: Session = Depends(get_db)):
    device = db.query(Node).filter(Node.node_id == device_id).first()
    if not device: raise HTTPException(status_code=404)
    db.query(Telemetry).filter(Telemetry.node_id == device_id).delete()
    db.delete(device)
    db.commit()
    return {"message": "Deleted"}

@router.get("/{device_id}/telemetry")
def get_telemetry_api(device_id: str, limit: int = 10, db: Session = Depends(get_db)):
    return db.query(Telemetry).filter(Telemetry.node_id == device_id).order_by(desc(Telemetry.telemetry_id)).limit(limit).all()

@router.post("/{device_id}/control")
async def control_device_api(device_id: str, request: Request):
    body = await request.json()
    action = body.get("action", "OFF")
    if mqtt_shared.mqtt_client: 
        mqtt_shared.mqtt_client.publish(mqtt_shared.MQTT_COMMAND_TOPIC.format(device_id), json.dumps({"type": "command", "payload": {"device_id": device_id, "action": action}}))
    return {"status": "success"}
