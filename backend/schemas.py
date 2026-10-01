from pydantic import BaseModel
from typing import Optional, Dict, Any

class RoomCreate(BaseModel):
    room_id: str
    room_name: str

class DeviceConfig(BaseModel):
    device_name: Optional[str] = None
    room_id: Optional[str] = None
    sampling_interval: int = 5
    telemetry_interval: int = 10
    enabled: bool = True
    gpio_config: Optional[Dict[str, int]] = {}

class RuleCreate(BaseModel):
    name: str
    sensor_node_id: str
    sensor_key: str
    condition_operator: str
    condition_value: float
    target_node_id: str
    action: str

class ScheduleCreate(BaseModel):
    room_id: str
    day_of_week: int
    start_time: str # "HH:MM:SS"
    end_time: str   # "HH:MM:SS"
    subject_code: str
    subject_name: str
    