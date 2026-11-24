import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

load_dotenv()

# อ่าน DATABASE_URL จาก .env หากไม่ได้ตั้งไว้ จะใช้ Local PostgreSQL เป็นค่าเริ่มต้น
SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:123456@localhost:5432/smart_classroom"
)

# รองรับกรณีแพลตฟอร์มส่งรูปแบบ postgres:// มาให้แปลงเป็น postgresql:// สำหรับ SQLAlchemy
if SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

# บังคับใช้ SSL อัตโนมัติเมื่อเชื่อมต่อฐานข้อมูลบน Cloud (Supabase) ไม่กระทบ Local
connect_args = {}
if (
    "localhost" not in SQLALCHEMY_DATABASE_URL
    and "127.0.0.1" not in SQLALCHEMY_DATABASE_URL
    and "sslmode=" not in SQLALCHEMY_DATABASE_URL
):
    connect_args["sslmode"] = "require"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,   # เช็กการเชื่อมต่อก่อนใช้งานทุกครั้ง กันอาการ DB ตัดการเชื่อมต่อ
    pool_recycle=300,     # รีไซเคิล Connection ทุก 5 นาทีให้เหมาะกับ Supabase Pooler
    connect_args=connect_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
