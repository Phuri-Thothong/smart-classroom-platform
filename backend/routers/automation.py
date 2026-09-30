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
    db_schedule = ClassSchedule(**schedule.dict(exclude={'start_time', 'end_time'}), 
                                start_time=datetime.strptime(schedule.start_time, "%H:%M:%S").time(),
                                end_time=datetime.strptime(schedule.end_time, "%H:%M:%S").time())
    db.add(db_schedule)
    db.commit()
    return db_schedule

@router.delete("/schedules/{schedule_id}")
def delete_schedule(schedule_id: int, db: Session = Depends(get_db)):
    db.query(ClassSchedule).filter(ClassSchedule.id == schedule_id).delete()
    db.commit()
    return {"status": "success"}
