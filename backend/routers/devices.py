import os
import io
import csv
import json
from typing import Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from sqlalchemy.orm.attributes import flag_modified
from database import get_db
from models import Node, Telemetry, SystemLog, User
from schemas import DeviceConfig
from auth import get_current_user, require_admin
import mqtt_shared
from dotenv import load_dotenv

load_dotenv()

NODE_TIMEOUT_MIN_GRACE = int(os.getenv("NODE_TIMEOUT_MIN_GRACE", 45))
BANGKOK_TZ = timezone(timedelta(hours=7))
MAX_TELEMETRY_ROWS = 5000

RANGE_DELTAS = {
    "1h": timedelta(hours=1),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
}

router = APIRouter(prefix="/devices", tags=["Devices"])


def to_bangkok_iso(ts) -> Optional[str]:
    if not ts:
        return None
    try:
        if isinstance(ts, datetime):
            dt = ts.replace(tzinfo=timezone.utc) if ts.tzinfo is None else ts
            return dt.astimezone(BANGKOK_TZ).isoformat()
        if isinstance(ts, str):
            raw = ts.strip()
            if not raw:
                return None
            if raw.endswith("Z"):
                dt = datetime.fromisoformat(raw[:-1] + "+00:00")
            else:
                dt = datetime.fromisoformat(raw)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=BANGKOK_TZ)
            return dt.astimezone(BANGKOK_TZ).isoformat()
    except Exception:
        return str(ts) if ts else None
    return None


def query_telemetry_records(db: Session, device_id: str, limit: int = 20, time_range: Optional[str] = None):
    query = db.query(Telemetry).filter(Telemetry.node_id == device_id)
    if time_range in RANGE_DELTAS:
        cutoff_str = (datetime.now(BANGKOK_TZ) - RANGE_DELTAS[time_range]).strftime("%Y-%m-%dT%H:%M:%S")
        return (
            query.filter(Telemetry.timestamp >= cutoff_str)
            .order_by(desc(Telemetry.telemetry_id))
            .limit(MAX_TELEMETRY_ROWS)
            .all()
        )
    safe_limit = max(1, min(limit, MAX_TELEMETRY_ROWS))
    return query.order_by(desc(Telemetry.telemetry_id)).limit(safe_limit).all()


@router.get("")
def get_devices(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    nodes = db.query(Node).filter(Node.status != "rejected").all()
    result = []
    for node in nodes:
        caps = node.capabilities if isinstance(node.capabilities, dict) else (json.loads(node.capabilities) if isinstance(node.capabilities, str) else {})
        if isinstance(caps, str):
            try:
                caps = json.loads(caps)
            except Exception:
                caps = {}

        default_tel = mqtt_shared.get_default_telemetry_interval(node.device_type)
        tel_interval = caps.get("telemetry_interval", default_tel)
        timeout_threshold = max(NODE_TIMEOUT_MIN_GRACE, tel_interval * 3)

        node_data = {
            "node_id": node.node_id,
            "room_id": node.room_id,
            "gateway_id": node.gateway_id,
            "device_type": node.device_type,
            "device_name": node.device_name,
            "status": node.status,
            "sampling_interval": caps.get("sampling_interval", 5),
            "telemetry_interval": tel_interval,
            "capabilities": caps,
            "device_state": "OFF",
            "last_seen": None,
            "latest_telemetry": None,
        }

        if node.status != "pending":
            gw_status = mqtt_shared.gateway_statuses.get(node.gateway_id, "offline")
            last_seen = mqtt_shared.node_last_seen.get(node.node_id)
            cached_tel = mqtt_shared.node_last_telemetry.get(node.node_id)
            latest_tel = None

            if last_seen is None or cached_tel is None:
                latest_tel = (
                    db.query(Telemetry)
                    .filter(Telemetry.node_id == node.node_id)
                    .order_by(desc(Telemetry.telemetry_id))
                    .first()
                )
                if latest_tel and latest_tel.data:
                    t_data = latest_tel.data
                    if isinstance(t_data, str):
                        try:
                            t_data = json.loads(t_data)
                        except Exception:
                            t_data = {}
                    if isinstance(t_data, dict):
                        cached_tel = t_data
                        mqtt_shared.node_last_telemetry[node.node_id] = t_data

            node_data["latest_telemetry"] = cached_tel

            if last_seen:
                node_data["last_seen"] = to_bangkok_iso(last_seen)
            elif latest_tel and latest_tel.timestamp:
                node_data["last_seen"] = to_bangkok_iso(latest_tel.timestamp)

            if gw_status != "online":
                node_data["status"] = "offline"
            else:
                if last_seen:
                    diff = abs((datetime.utcnow() - last_seen).total_seconds())
                    node_data["status"] = "offline" if diff > timeout_threshold else "active"
                elif latest_tel and latest_tel.timestamp:
                    try:
                        parsed_iso = to_bangkok_iso(latest_tel.timestamp)
                        tel_time = datetime.fromisoformat(parsed_iso)
                        actual_diff = abs((datetime.now(BANGKOK_TZ) - tel_time).total_seconds())
                        node_data["status"] = "offline" if actual_diff > timeout_threshold else "active"
                    except Exception:
                        node_data["status"] = "offline"
                else:
                    node_data["status"] = "offline"

            if node.node_id in mqtt_shared.node_last_states:
                node_data["device_state"] = mqtt_shared.node_last_states[node.node_id]
            elif isinstance(cached_tel, dict):
                node_data["device_state"] = cached_tel.get("status", "OFF")

        result.append(node_data)
    return result


@router.get("/rejected")
def get_rejected_devices(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(Node).filter(Node.status == "rejected").all()


@router.get("/{device_id}")
def get_device_api(device_id: str, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Node).filter(Node.node_id == device_id).first() or {"error": "Not found"}


@router.post("/{device_id}/approve")
def approve_device_api(
    device_id: str,
    config: DeviceConfig,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    node = db.query(Node).filter(Node.node_id == device_id).first()
    if not node:
        raise HTTPException(status_code=404, detail="Device not found")
    node.status = "approved"
    if config.device_name:
        node.device_name = config.device_name
    if config.room_id:
        node.room_id = config.room_id
    caps = {}
    if node.capabilities:
        if isinstance(node.capabilities, str):
            try:
                parsed = json.loads(node.capabilities)
                caps = json.loads(parsed) if isinstance(parsed, str) else parsed
            except Exception:
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
        "gpio_config": config.gpio_config,
    }
    if mqtt_shared.mqtt_client:
        topic = mqtt_shared.MQTT_CONFIG_TOPIC.format(device_id)
        mqtt_shared.mqtt_client.publish(topic, json.dumps({"type": "config", "payload": config_data}))
        print(f"\n[Platform] Configuration sent to {topic}")

    return {"device": node, "configuration": config_data}


@router.post("/{device_id}/config")
def update_device_config(
    device_id: str,
    config: DeviceConfig,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return approve_device_api(device_id, config, db, admin)


@router.delete("/{device_id}")
def delete_device(device_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    device = db.query(Node).filter(Node.node_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404)
    db.query(Telemetry).filter(Telemetry.node_id == device_id).delete()
    device.status = "rejected"
    db.add(SystemLog(source="SYSTEM", log_type="WARN", message=f"Admin '{admin.username}' deleted/rejected device {device_id}"))
    mqtt_shared.node_last_seen.pop(device_id, None)
    mqtt_shared.node_last_states.pop(device_id, None)
    mqtt_shared.node_last_telemetry.pop(device_id, None)
    db.commit()
    return {"message": "Device rejected and moved to blocklist"}


@router.get("/{device_id}/telemetry")
def get_telemetry_api(
    device_id: str,
    limit: int = 20,
    range: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return query_telemetry_records(db, device_id, limit, range)


@router.get("/{device_id}/telemetry/export")
def export_telemetry_csv(
    device_id: str,
    limit: int = 100,
    range: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = query_telemetry_records(db, device_id, limit, range)
    rows.reverse()

    output = io.StringIO()
    output.write("\ufeff")
    writer = csv.writer(output)

    preferred_keys = [
        "status",
        "presence",
        "occupancy",
        "temperature",
        "humidity",
        "light_lux",
        "lux",
        "power_usage_watts",
    ]
    parsed_rows = []
    found_keys = set()

    for r in rows:
        s_data = r.data
        if isinstance(s_data, str):
            try:
                s_data = json.loads(s_data)
            except Exception:
                s_data = {}
        if not isinstance(s_data, dict):
            s_data = {}
        parsed_rows.append((r, s_data))
        found_keys.update(s_data.keys())

    ordered_keys = [k for k in preferred_keys if k in found_keys] + sorted(
        k for k in found_keys if k not in preferred_keys
    )
    writer.writerow(["telemetry_id", "node_id", "timestamp_bkk"] + ordered_keys)

    for r, s_data in parsed_rows:
        ts_iso = to_bangkok_iso(r.timestamp) or r.timestamp or ""
        writer.writerow([r.telemetry_id, r.node_id, ts_iso] + [s_data.get(k, "") for k in ordered_keys])

    output.seek(0)
    suffix = range if range in RANGE_DELTAS else f"latest_{limit}"
    filename = f"telemetry_{device_id}_{suffix}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{device_id}/control")
async def control_device_api(
    device_id: str,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    body = await request.json()
    action = body.get("action", "OFF")
    if mqtt_shared.mqtt_client:
        mqtt_shared.mqtt_client.publish(
            mqtt_shared.MQTT_COMMAND_TOPIC.format(device_id),
            json.dumps({"type": "command", "payload": {"device_id": device_id, "action": action}}),
        )
        db.add(SystemLog(source="MANUAL", log_type="ACTION", message=f"Admin '{admin.username}' turned {action} {device_id}"))
        db.commit()
    return {"status": "success"}


@router.post("/{device_id}/restore")
def restore_device_api(device_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    device = db.query(Node).filter(Node.node_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404)
    if mqtt_shared.mqtt_client:
        topic = mqtt_shared.MQTT_COMMAND_TOPIC.format(device_id)
        payload = {"type": "command", "payload": {"device_id": device_id, "action": "RESET"}}
        mqtt_shared.mqtt_client.publish(topic, json.dumps(payload))
    device.status = "pending"
    db.add(SystemLog(source="MANUAL", log_type="INFO", message=f"Admin '{admin.username}' restored {device_id} from blocklist. RESET command sent."))
    mqtt_shared.node_last_seen.pop(device_id, None)
    mqtt_shared.node_last_states.pop(device_id, None)
    mqtt_shared.node_last_telemetry.pop(device_id, None)
    db.commit()
    return {"status": "success"}


@router.post("/{device_id}/reject")
def reject_device_api(device_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    device = db.query(Node).filter(Node.node_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404)
    device.status = "rejected"
    db.add(SystemLog(source="SYSTEM", log_type="WARN", message=f"Admin '{admin.username}' rejected device {device_id}"))
    mqtt_shared.node_last_seen.pop(device_id, None)
    mqtt_shared.node_last_states.pop(device_id, None)
    mqtt_shared.node_last_telemetry.pop(device_id, None)
    db.commit()
    return {"status": "success"}


@router.post("/{device_id}/factory-reset")
def factory_reset_device_api(device_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    device = db.query(Node).filter(Node.node_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404)
    if mqtt_shared.mqtt_client:
        topic = mqtt_shared.MQTT_COMMAND_TOPIC.format(device_id)
        mqtt_shared.mqtt_client.publish(
            topic,
            json.dumps({"type": "command", "payload": {"device_id": device_id, "action": "RESET"}}),
        )
    db.query(Telemetry).filter(Telemetry.node_id == device_id).delete()
    db.delete(device)
    db.add(SystemLog(source="MANUAL", log_type="WARN", message=f"Admin '{admin.username}' triggered Factory Reset for {device_id}"))
    mqtt_shared.node_last_seen.pop(device_id, None)
    mqtt_shared.node_last_states.pop(device_id, None)
    mqtt_shared.node_last_telemetry.pop(device_id, None)
    db.commit()
    return {"status": "success"}
