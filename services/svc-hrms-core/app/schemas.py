from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import date, time

# ==================
#  Reusable Schemas
# ==================

class Location(BaseModel):
    lat: float
    lng: float

# ==================
#  Token Schemas
# ==================

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# ==================
#  Company Schemas
# ==================

class CompanyBase(BaseModel):
    name: str
    address: str
    location: Location

class CompanyUpdate(CompanyBase):
    pass

class Company(CompanyBase):
    id: int

    class Config:
        from_attributes = True # Renamed from orm_mode

# ==================
#  Project Schemas
# ==================

class ProjectBase(BaseModel):
    id: str
    name: str
    location: Location

class ProjectCreate(ProjectBase):
    pass

class Project(ProjectBase):
    class Config:
        from_attributes = True # Renamed from orm_mode

# ==================
#  User Schemas
# ==================

class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: str
    hiring_date: Optional[date] = None
    probation_end: Optional[date] = None
    work_start_time: Optional[time] = None
    work_end_time: Optional[time] = None
    work_week: Optional[List[str]] = []
    allowed_locations: Optional[List[str]] = []

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    hiring_date: Optional[date] = None
    probation_end: Optional[date] = None
    work_start_time: Optional[time] = None
    work_end_time: Optional[time] = None
    work_week: Optional[List[str]] = None
    allowed_locations: Optional[List[str]] = None

class User(UserBase):
    id: int
    is_active: bool

    class Config:
        from_attributes = True # Renamed from orm_mode