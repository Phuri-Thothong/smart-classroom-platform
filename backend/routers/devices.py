import os
import json
from datetime import datetime
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from sqlalchemy.orm.attributes import flag_modified
from database import get_db
from models import Node, Telemetry, SystemLog
from schemas import DeviceConfig
import mqtt_shared

NODE_TIMEOUT_MIN_GRACE = int(os.getenv("NODE_TIMEOUT_MIN_GRACE", 45))

router = APIRouter(prefix="/devices", tags=["Devices"])

@router.get("")
def get_devices(db: Session = Depends(get_db)):
    nodes = db.query(Node).filter(Node.status != "rejected").all()
    result, current_time = [], datetime.utcnow()
    for node in nodes:
        caps = node.capabilities if isinstance(node.capabilities, dict) else (json.loads(node.capabilities) if isinstance(node.capabilities, str) else {})
        if isinstance(caps, str): 
            try: caps = json.loads(caps)
            except: caps = {}
        
        tel_interval = caps.get("telemetry_interval", 10)
        timeout_threshold = max(NODE_TIMEOUT_MIN_GRACE, tel_interval * 3)
        
        node_data = {
            "node_id": node.node_id, "room_id": node.room_id, "gateway_id": node.gateway_id,
            "device_type": node.device_type, "device_name": node.device_name,
            "status": node.status, 
            "sampling_interval": caps.get("sampling_interval", 5),
            "telemetry_interval": tel_interval,
            "capabilities": caps,
            "device_state": "OFF"
        }
        
        if node.status != "pending":
            gw_status = mqtt_shared.gateway_statuses.get(node.gateway_id, "offline")
            
            if gw_status != "online":
                node_data["status"] = "offline"
            else:
                latest_tel = db.query(Telemetry).filter(Telemetry.node_id == node.node_id).order_by(desc(Telemetry.telemetry_id)).first()
                if latest_tel and latest_tel.timestamp:
                    try:
                        time_str = latest_tel.timestamp.replace("Z", "")
                        tel_time = datetime.fromisoformat(time_str) if isinstance(latest_tel.timestamp, str) else latest_tel.timestamp.replace(tzinfo=None)
                        diff_utc = abs((datetime.utcnow() - tel_time).total_seconds())
                        diff_local = abs((datetime.now() - tel_time).total_seconds())
                        actual_diff = min(diff_utc, diff_local)
                        
                        node_data["status"] = "offline" if actual_diff > timeout_threshold else "active"
                        
                        t_data = latest_tel.data
                        if isinstance(t_data, str):
                            try: t_data = json.loads(t_data)
                            except: t_data = {}
                        if isinstance(t_data, dict):
                            node_data["device_state"] = t_data.get("status", "OFF")
                    except Exception: node_data["status"] = "offline"
                else: 
                    node_data["status"] = "offline"
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
    caps = {}
    if node.capabilities:
        if isinstance(node.capabilities, str):
            try:
                parsed = json.loads(node.capabilities)
                caps = json.loads(parsed) if isinstance(parsed, str) else parsed
            except:
                pass
        elif isinstance(node.capabilities, dict):
            caps = dict(node.capabilities)
    if not isinstance(caps, dict):
        caps = {}
    caps["sampling_interval"] = config.sampling_interval
    caps["telemetry_interval"] = config.telemetry_interval
    if config.gpio_config:
        caps["gpio_config"] = config.gpio_config
    node.capabilities = caps 
    flag_modified(node, "capabilities")
    db.commit()
    db.refresh(node)
    config_data = {
        "device_id": device_id, 
        "config_version": 1, 
        "sampling_interval": config.sampling_interval,
        "telemetry_interval": config.telemetry_interval,
        "enabled": config.enabled,
        "gpio_config": config.gpio_config
    }
    if mqtt_shared.mqtt_client: 
        topic = mqtt_shared.MQTT_CONFIG_TOPIC.format(device_id)
        mqtt_shared.mqtt_client.publish(topic, json.dumps({"type": "config", "payload": config_data}))
        print(f"\n[Platform] Configuration sent to {topic}")
        
    return {"device": node, "configuration": config_data}

@router.post("/{device_id}/config")
def update_device_config(device_id: str, config: DeviceConfig, db: Session = Depends(get_db)):
    return approve_device_api(device_id, config, db)

@router.delete("/{device_id}")
def delete_device(device_id: str, db: Session = Depends(get_db)):
    device = db.query(Node).filter(Node.node_id == device_id).first()
    if not device: raise HTTPException(status_code=404)
    db.query(Telemetry).filter(Telemetry.node_id == device_id).delete()
    device.status = "rejected"
    db.add(SystemLog(source="SYSTEM", log_type="WARN", message=f"Device {device_id} was rejected/deleted and added to blocklist"))
    db.commit()
    return {"message": "Device rejected and moved to blocklist"}

@router.get("/{device_id}/telemetry")
def get_telemetry_api(device_id: str, limit: int = 10, db: Session = Depends(get_db)):
    return db.query(Telemetry).filter(Telemetry.node_id == device_id).order_by(desc(Telemetry.telemetry_id)).limit(limit).all()

@router.post("/{device_id}/control")
async def control_device_api(device_id: str, request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    action = body.get("action", "OFF")
    if mqtt_shared.mqtt_client: 
        mqtt_shared.mqtt_client.publish(mqtt_shared.MQTT_COMMAND_TOPIC.format(device_id), json.dumps({"type": "command", "payload": {"device_id": device_id, "action": action}}))
        db.add(SystemLog(source="MANUAL", log_type="ACTION", message=f"Admin turned {action} {device_id}"))
        db.commit()
    return {"status": "success"}

@router.post("/{device_id}/reject")
def reject_device_api(device_id: str, db: Session = Depends(get_db)):
    device = db.query(Node).filter(Node.node_id == device_id).first()
    if not device: 
        raise HTTPException(status_code=404)
    device.status = "rejected"
    db.add(SystemLog(source="SYSTEM", log_type="WARN", message=f"Device {device_id} was rejected and moved to blocklist"))
    db.commit()
    return {"status": "success"}

@router.post("/{device_id}/factory-reset")
def factory_reset_device_api(device_id: str, db: Session = Depends(get_db)):
    device = db.query(Node).filter(Node.node_id == device_id).first()
    if not device: 
        raise HTTPException(status_code=404)
    if mqtt_shared.mqtt_client:
        topic = mqtt_shared.MQTT_COMMAND_TOPIC.format(device_id)
        mqtt_shared.mqtt_client.publish(
            topic, 
            json.dumps({"type": "command", "payload": {"device_id": device_id, "action": "RESET"}})
        )
    db.query(Telemetry).filter(Telemetry.node_id == device_id).delete()
    db.delete(device)
    db.add(SystemLog(source="MANUAL", log_type="WARN", message=f"Admin triggered Factory Reset for {device_id}"))
    db.commit()
    return {"status": "success"}
