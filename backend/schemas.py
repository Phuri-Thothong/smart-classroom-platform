from pydantic import BaseModel, Field
from typing import Optional, Dict, Literal
from datetime import datetime

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
    condition_value: str
    target_node_id: str
    action: str

class ScheduleCreate(BaseModel):
    room_id: str
    day_of_week: int
    start_time: str  # "HH:MM:SS"
    end_time: str    # "HH:MM:SS"
    subject_code: str
    subject_name: str

# ==========================================
# AUTH & USER SCHEMAS
# ==========================================
class LoginRequest(BaseModel):
    username: str
    password: str

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=72)
    full_name: Optional[str] = ""
    role: Literal["admin", "viewer"] = "viewer"

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[Literal["admin", "viewer"]] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(default=None, min_length=6, max_length=72)

class UserResponse(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
        