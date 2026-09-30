from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import Node
import mqtt_shared

router = APIRouter(prefix="/gateways", tags=["Gateways"])

@router.get("/status")
def get_gateway_status(db: Session = Depends(get_db)):
    active = db.query(Node.gateway_id).distinct().all()
    return {gw_id: mqtt_shared.gateway_statuses.get(gw_id, "offline") for (gw_id,) in active if gw_id} | mqtt_shared.gateway_statuses
