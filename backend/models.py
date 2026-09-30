from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, Time, JSON, DateTime
from sqlalchemy.sql import func
from database import Base

class Room(Base):
    __tablename__ = "rooms"
    
    room_id = Column(String, primary_key=True, index=True)
    room_name = Column(String, nullable=False)

class Node(Base):
    __tablename__ = "nodes"
    
    node_id = Column(String, primary_key=True, index=True)
    room_id = Column(String, ForeignKey("rooms.room_id", ondelete="SET NULL"), nullable=True)
    gateway_id = Column(String)
    device_type = Column(String)
    device_name = Column(String)
    firmware_version = Column(String)
    status = Column(String, default="pending")
    capabilities = Column(JSON) 
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Telemetry(Base):
    __tablename__ = "telemetry"
    
    telemetry_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    node_id = Column(String, ForeignKey("nodes.node_id", ondelete="CASCADE"), nullable=False)
    timestamp = Column(String)
    data = Column(JSON)

# ==========================================
# AUTOMATION & SCHEDULE TABLES
# ==========================================
class AutomationRule(Base):
    __tablename__ = "automation_rules"
    
    rule_id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)
    sensor_node_id = Column(String, ForeignKey("nodes.node_id", ondelete="CASCADE"), nullable=False)
    sensor_key = Column(String, nullable=False)
    condition_operator = Column(String, nullable=False)
    condition_value = Column(Float, nullable=False)
    target_node_id = Column(String, ForeignKey("nodes.node_id", ondelete="CASCADE"), nullable=False)
    action = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)

class ClassSchedule(Base):
    __tablename__ = "class_schedules"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    room_id = Column(String, ForeignKey("rooms.room_id", ondelete="CASCADE"), nullable=False)
    day_of_week = Column(Integer, nullable=False) # 1=Sun, 2=Mon, 3=Tue, ... 7=Sat
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    subject_code = Column(String)
    subject_name = Column(String)
    