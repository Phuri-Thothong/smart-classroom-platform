from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import Room, Node
from schemas import RoomCreate

router = APIRouter(prefix="/rooms", tags=["Rooms"])

@router.get("")
def get_rooms(db: Session = Depends(get_db)):
    return db.query(Room).all()

@router.post("")
def create_room(room: RoomCreate, db: Session = Depends(get_db)):
    if db.query(Room).filter(Room.room_id == room.room_id).first():
        raise HTTPException(status_code=400, detail="Room ID already exists")
    new_room = Room(room_id=room.room_id, room_name=room.room_name)
    db.add(new_room)
    db.commit()
    db.refresh(new_room)
    return new_room

@router.delete("/{room_id}")
def delete_room(room_id: str, db: Session = Depends(get_db)):
    room = db.query(Room).filter(Room.room_id == room_id).first()
    if not room: 
        raise HTTPException(status_code=404, detail="Room not found")
    db.query(Node).filter(Node.room_id == room_id).update({"room_id": None})
    db.delete(room)
    db.commit()
    return {"message": "Deleted"}
