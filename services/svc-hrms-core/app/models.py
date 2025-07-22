from sqlalchemy import Column, Integer, String, Date, Time, Boolean, ARRAY, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
from sqlalchemy.sql import func
from .database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="Employee")
    hiring_date = Column(Date)
    probation_end = Column(Date)
    work_start_time = Column(Time)
    work_end_time = Column(Time)
    work_week = Column(ARRAY(String))
    allowed_locations = Column(ARRAY(String))
    is_active = Column(Boolean, default=True)
    azure_person_id = Column(String, nullable=True, unique=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now()) # Added server_default for initial creation
    
class Project(Base):
    __tablename__ = "projects"
    
    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    location_lat = Column(Float)
    location_lng = Column(Float)
    
    status = Column(String, default="Active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

class Company(Base):
    __tablename__ = "company"
    
    id = Column(Integer, primary_key=True, default=1)
    name = Column(String)
    address = Column(String)
    location_lat = Column(Float)
    location_lng = Column(Float)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    
    actor_id = Column(Integer, ForeignKey("users.id"))
    actor_email = Column(String)

    action = Column(String)

    # --- NEW COLUMNS TO IDENTIFY THE SUBJECT OF THE LOG ---
    target_type = Column(String, index=True) # e.g., "USER", "PROJECT"
    target_id = Column(String, index=True)   # e.g., "123" (user id) or "proj-abc" (project id)

    details = Column(String, nullable=True)