from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import date, time, datetime

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
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ==================
#  Project Schemas
# ==================

class ProjectBase(BaseModel):
    id: str
    name: str
    location: Location
    status: str

class ProjectCreate(ProjectBase):
    pass

class Project(ProjectBase):
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

# ==================
#  User Schemas
# ==================

class FaceRegistration(BaseModel):
    descriptor: List[float]

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
    azure_person_id: Optional[str] = None

class User(UserBase):
    id: int
    is_active: bool
    has_face_descriptor: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ==================
#  AuditLog Schemas
# ==================

class AuditLog(BaseModel):
    id: int
    timestamp: datetime
    actor_email: str
    action: str
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    details: Optional[str] = None

    class Config:
        from_attributes = True

# ==================
#  LeaveRequest Schemas
# ==================

class LeaveRequestBase(BaseModel):
    leave_type: str
    start_date: date
    end_date: date
    reason: str

class LeaveRequestCreate(LeaveRequestBase):
    pass

class LeaveRequestUpdate(BaseModel):
    status: str

class LeaveRequest(LeaveRequestBase):
    id: int
    owner_id: int
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    owner_name: Optional[str] = None

    class Config:
        from_attributes = True

# ==================
#  AttendanceRecord Schemas
# ==================

class AttendanceRecordBase(BaseModel):
    date: date
    check_in_time: datetime
    check_out_time: Optional[datetime] = None

class AttendanceRecord(AttendanceRecordBase):
    id: int
    user_id: int
    user_name: Optional[str] = None

    class Config:
        from_attributes = True

# ==================
#  Workflow & Task Schemas (NEW)
# ==================

class TemplateTaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    default_assignee_role: str # e.g., "HR", "IT", "Manager"

class TemplateTask(TemplateTaskBase):
    id: int
    template_id: int
    order: int

    class Config:
        from_attributes = True

class WorkflowTemplateBase(BaseModel):
    name: str
    type: str # "ONBOARDING" or "OFFBOARDING"

class WorkflowTemplateCreate(WorkflowTemplateBase):
    tasks: List[TemplateTaskBase]

class WorkflowTemplate(WorkflowTemplateBase):
    id: int
    tasks: List[TemplateTask] = []

    class Config:
        from_attributes = True

class WorkflowTask(BaseModel):
    id: int
    title: str
    status: str
    completed_at: Optional[datetime] = None
    completed_by_name: Optional[str] = None # For easy display

    class Config:
        from_attributes = True

class WorkflowInstance(BaseModel):
    id: int
    user_id: int
    user_name: str
    template_name: str
    status: str
    created_at: datetime
    tasks: List[WorkflowTask] = []

    class Config:
        from_attributes = True

class WorkflowInstanceCreate(BaseModel):
    template_id: int
    user_id: int

class WorkflowTaskUpdate(BaseModel):
    status: str # "Completed"
