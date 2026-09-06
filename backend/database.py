from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# URL สำหรับเชื่อมต่อ PostgreSQL 
# รูปแบบ: postgresql://<username>:<password>@<host>:<port>/<db_name>
# *** ให้เปลี่ยน username และ password ตามที่คุณตั้งไว้ใน pgAdmin ***
SQLALCHEMY_DATABASE_URL = "postgresql://postgres:123456@localhost:5432/smart_classroom"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
        