# services/svc-hrms-core/app/schemas.py

from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import date, time, datetime

# ==================
#  Reusable Schemas
# ==================

class Location(BaseModel):
    lat: float
    lng: float

# ==================
#  Token Schemas
# ==================

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None

# ==================
#  Company Schemas
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
#  Project Schemas
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
#  User Schemas
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
    # --- CORRECTED: Changed from azure_person_id ---
    rekognition_face_id: Optional[str] = None

class User(UserBase):
    id: int
    is_active: bool
    has_face_descriptor: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ==================
#  AuditLog Schemas
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
#  LeaveRequest Schemas
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
#  AttendanceRecord Schemas
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
#  Workflow & Task Schemas
# ==================

class TemplateTaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    default_assignee_role: str

# --- NEW: Added TemplateTaskCreate for the seeder script ---
class TemplateTaskCreate(TemplateTaskBase):
    pass

class TemplateTask(TemplateTaskBase):
    id: int
    template_id: int
    order: int

    class Config:
        from_attributes = True

class WorkflowTemplateBase(BaseModel):
    name: str
    type: str

class WorkflowTemplateCreate(WorkflowTemplateBase):
    # This now correctly uses TemplateTaskCreate
    tasks: List[TemplateTaskCreate]

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
    completed_by_name: Optional[str] = None

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
    status: str

# ==================
#  Payroll Schemas
# ==================

class SalaryBase(BaseModel):
    gross_salary: float
    pay_frequency: str
    effective_date: date

class SalaryCreate(SalaryBase):
    user_id: int

class Salary(SalaryBase):
    id: int
    is_current: bool

    class Config:
        from_attributes = True

class BankDetailsBase(BaseModel):
    bank_name: str
    account_number: str
    iban: str

class BankDetailsCreate(BankDetailsBase):
    user_id: int

class BankDetails(BankDetailsBase):
    id: int

    class Config:
        from_attributes = True

class PayslipBase(BaseModel):
    pay_period_start: date
    pay_period_end: date
    gross_salary: float
    deductions: float
    net_salary: float
    status: str

class Payslip(PayslipBase):
    id: int
    user_id: int
    user_name: Optional[str] = None
    run_date: datetime

    class Config:
        from_attributes = True
