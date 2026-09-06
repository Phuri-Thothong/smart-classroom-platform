from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
from database import Base

class Room(Base):
    __tablename__ = "rooms"
    
    room_id = Column(String, primary_key=True, index=True)
    room_name = Column(String, nullable=True)

class Node(Base):
    __tablename__ = "nodes"
    
    node_id = Column(String, primary_key=True, index=True)
    room_id = Column(String, ForeignKey("rooms.room_id"), nullable=True)
    gateway_id = Column(String, nullable=True)
    
    device_type = Column(String)
    device_name = Column(String)
    firmware_version = Column(String)
    status = Column(String, default="pending")
    capabilities = Column(JSON) # เก็บ Array เช่น ["lighting_control"]
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Telemetry(Base):
    __tablename__ = "telemetry"
    
    telemetry_id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    node_id = Column(String, ForeignKey("nodes.node_id"))
    timestamp = Column(String) 
    data = Column(JSON) # เก็บข้อมูล Dynamic เช่น {"light_status": "ON", "power_usage": 15.5}
    