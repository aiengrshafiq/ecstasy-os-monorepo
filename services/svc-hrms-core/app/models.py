from sqlalchemy import Column, Integer, String, Date, Time, Boolean, ARRAY, Float
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

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
    work_week = Column(ARRAY(String)) # e.g., ['Mon', 'Tue', 'Wed']
    allowed_locations = Column(ARRAY(String)) # e.g., ['company', 'proj-1']
    is_active = Column(Boolean, default=True)
    
class Project(Base):
    __tablename__ = "projects"
    
    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    location_lat = Column(Float)
    location_lng = Column(Float)

class Company(Base):
    __tablename__ = "company"
    
    id = Column(Integer, primary_key=True, default=1) # There's only one company profile
    name = Column(String)
    address = Column(String)
    location_lat = Column(Float)
    location_lng = Column(Float)