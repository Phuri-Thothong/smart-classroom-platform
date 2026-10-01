from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import AutomationRule, ClassSchedule
from schemas import RuleCreate, ScheduleCreate

router = APIRouter(prefix="", tags=["Automation"])

@router.get("/rules")
def get_rules(db: Session = Depends(get_db)): 
    return db.query(AutomationRule).all()

@router.post("/rules")
def create_rule(rule: RuleCreate, db: Session = Depends(get_db)):
    db_rule = AutomationRule(**rule.dict())
    db.add(db_rule)
    db.commit()
    return db_rule

@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    db.query(AutomationRule).filter(AutomationRule.rule_id == rule_id).delete()
    db.commit()
    return {"status": "success"}

@router.get("/schedules")
def get_schedules(db: Session = Depends(get_db)): 
    return db.query(ClassSchedule).all()

@router.post("/schedules")
def create_schedule(schedule: ScheduleCreate, db: Session = Depends(get_db)):
    try:
        st_time = datetime.strptime(schedule.start_time, "%H:%M:%S").time()
        en_time = datetime.strptime(schedule.end_time, "%H:%M:%S").time()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM:SS")
    overlapping_classes = db.query(ClassSchedule).filter(
        ClassSchedule.room_id == schedule.room_id,
        ClassSchedule.day_of_week == schedule.day_of_week,
        ClassSchedule.start_time < en_time,
        ClassSchedule.end_time > st_time
    ).all()
    if overlapping_classes:
        conflict_details = [
            f"Overlaps with '{cls.subject_code}' ({cls.start_time.strftime('%H:%M')} - {cls.end_time.strftime('%H:%M')})"
            for cls in overlapping_classes
        ]
        raise HTTPException(status_code=400, detail=conflict_details)
    db_schedule = ClassSchedule(
        room_id=schedule.room_id,
        day_of_week=schedule.day_of_week,
        start_time=st_time,
        end_time=en_time,
        subject_code=schedule.subject_code,
        subject_name=schedule.subject_name
    )
    db.add(db_schedule)
    db.commit()
    db.refresh(db_schedule)
    return db_schedule

@router.delete("/schedules/{schedule_id}")
def delete_schedule(schedule_id: int, db: Session = Depends(get_db)):
    db.query(ClassSchedule).filter(ClassSchedule.id == schedule_id).delete()
    db.commit()
    return {"status": "success"}

@router.put("/schedules/{schedule_id}")
def update_schedule(schedule_id: int, schedule: ScheduleCreate, db: Session = Depends(get_db)):
    try:
        st_time = datetime.strptime(schedule.start_time, "%H:%M:%S").time()
        en_time = datetime.strptime(schedule.end_time, "%H:%M:%S").time()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid time format. Use HH:MM:SS")
    overlapping_classes = db.query(ClassSchedule).filter(
        ClassSchedule.room_id == schedule.room_id,
        ClassSchedule.day_of_week == schedule.day_of_week,
        ClassSchedule.start_time < en_time,
        ClassSchedule.end_time > st_time,
        ClassSchedule.id != schedule_id
    ).all()
    if overlapping_classes:
        conflict_details = [
            f"Overlaps with '{cls.subject_code}' ({cls.start_time.strftime('%H:%M')} - {cls.end_time.strftime('%H:%M')})"
            for cls in overlapping_classes
        ]
        raise HTTPException(status_code=400, detail=conflict_details)
    db_sched = db.query(ClassSchedule).filter(ClassSchedule.id == schedule_id).first()
    if not db_sched:
        raise HTTPException(status_code=404, detail="Schedule not found")
    db_sched.room_id = schedule.room_id
    db_sched.day_of_week = schedule.day_of_week
    db_sched.start_time = st_time
    db_sched.end_time = en_time
    db_sched.subject_code = schedule.subject_code
    db_sched.subject_name = schedule.subject_name
    db.commit()
    db.refresh(db_sched)
    return db_sched
