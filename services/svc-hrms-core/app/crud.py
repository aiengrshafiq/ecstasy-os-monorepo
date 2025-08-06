from sqlalchemy.orm import Session, joinedload
from datetime import date
from . import models, schemas
from .auth import get_password_hash

# ==================
#  AuditLog CRUD
# ==================

def create_audit_log(db: Session, actor: models.User, action: str, details: str, target_type: str = None, target_id: str = None):
    db_log = models.AuditLog(
        actor_id=actor.id,
        actor_email=actor.email,
        action=action,
        details=details,
        target_type=target_type,
        target_id=target_id
    )
    db.add(db_log)
    db.commit()
    return db_log

def get_audit_logs_for_target(db: Session, target_type: str, target_id: str):
    return db.query(models.AuditLog).filter(
        models.AuditLog.target_type == target_type,
        models.AuditLog.target_id == target_id
    ).order_by(models.AuditLog.timestamp.desc()).all()


# ==================
#  User CRUD
# ==================

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def get_users(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.User).offset(skip).limit(limit).all()

def create_user(db: Session, user: schemas.UserCreate, actor: models.User):
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        email=user.email,
        name=user.name,
        hashed_password=hashed_password,
        role=user.role,
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    create_audit_log(
        db,
        actor=actor,
        action="CREATE_USER",
        details=f"Created new user '{db_user.name}' with role '{db_user.role}'.",
        target_type="USER",
        target_id=str(db_user.id)
    )
    
    return db_user

def update_user(db: Session, user_id: int, user_update: schemas.UserUpdate, actor: models.User):
    db_user = get_user(db, user_id)
    if not db_user:
        return None
    
    change_details = []
    update_data = user_update.dict(exclude_unset=True)
    for key, new_value in update_data.items():
        old_value = getattr(db_user, key)
        if old_value != new_value:
            change_details.append(f"Changed {key.replace('_', ' ')} from '{old_value}' to '{new_value}'.")
            setattr(db_user, key, new_value)
    
    if change_details:
        db.commit()
        db.refresh(db_user)
        create_audit_log(
            db,
            actor=actor,
            action="UPDATE_USER",
            details=" | ".join(change_details),
            target_type="USER",
            target_id=str(db_user.id)
        )
        
    return db_user

def register_user_face(db: Session, user_id: int, actor: models.User):
    db_user = get_user(db, user_id)
    if not db_user:
        return None
    
    create_audit_log(
        db,
        actor=actor,
        action="REGISTER_FACE",
        details=f"Registered a new face for user '{db_user.name}'.",
        target_type="USER",
        target_id=str(db_user.id)
    )
    return db_user

# ==================
#  Company CRUD
# ==================
def get_company(db: Session):
    return db.query(models.Company).filter(models.Company.id == 1).first()

def create_or_update_company(db: Session, company: schemas.CompanyUpdate, actor: models.User):
    db_company = get_company(db)
    change_details = []
    
    if db_company:
        if db_company.name != company.name:
            change_details.append(f"Changed name from '{db_company.name}' to '{company.name}'.")
            db_company.name = company.name
        if db_company.address != company.address:
            change_details.append(f"Changed address from '{db_company.address}' to '{company.address}'.")
            db_company.address = company.address
        db_company.location_lat = company.location.lat
        db_company.location_lng = company.location.lng
    else:
        change_details.append(f"Created company profile with name '{company.name}'.")
        db_company = models.Company(
            id=1,
            name=company.name,
            address=company.address,
            location_lat=company.location.lat,
            location_lng=company.location.lng
        )
        db.add(db_company)
    
    db.commit()
    db.refresh(db_company)
    
    if change_details:
        create_audit_log(
            db,
            actor=actor,
            action="UPDATE_COMPANY",
            details=" | ".join(change_details)
        )
        
    return db_company

# ==================
#  Project CRUD
# ==================
def get_projects(db: Session):
    return db.query(models.Project).all()

def create_project(db: Session, project: schemas.ProjectCreate, actor: models.User):
    db_project = models.Project(
        id=project.id,
        name=project.name,
        status=project.status,
        location_lat=project.location.lat,
        location_lng=project.location.lng
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    create_audit_log(
        db,
        actor=actor,
        action="CREATE_PROJECT",
        details=f"Created new project '{db_project.name}'.",
        target_type="PROJECT",
        target_id=str(db_project.id)
    )
    
    return db_project

def update_project(db: Session, project_id: str, project_update: schemas.ProjectCreate, actor: models.User):
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        return None
    
    change_details = []
    if db_project.name != project_update.name:
        change_details.append(f"Changed name from '{db_project.name}' to '{project_update.name}'.")
        db_project.name = project_update.name
    if db_project.status != project_update.status:
        change_details.append(f"Changed status from '{db_project.status}' to '{project_update.status}'.")
        db_project.status = project_update.status
    
    db_project.location_lat = project_update.location.lat
    db_project.location_lng = project_update.location.lng
    
    if change_details:
        db.commit()
        db.refresh(db_project)
        create_audit_log(
            db,
            actor=actor,
            action="UPDATE_PROJECT",
            details=" | ".join(change_details),
            target_type="PROJECT",
            target_id=str(db_project.id)
        )
        
    return db_project

# ==================
#  LeaveRequest CRUD
# ==================

def create_leave_request(db: Session, request: schemas.LeaveRequestCreate, owner_id: int):
    db_request = models.LeaveRequest(**request.dict(), owner_id=owner_id)
    db.add(db_request)
    db.commit()
    db.refresh(db_request)
    return db_request

def get_leave_request(db: Session, request_id: int):
    return db.query(models.LeaveRequest).filter(models.LeaveRequest.id == request_id).first()

def get_leave_requests_by_owner(db: Session, owner_id: int):
    return db.query(models.LeaveRequest).filter(models.LeaveRequest.owner_id == owner_id).order_by(models.LeaveRequest.start_date.desc()).all()

def get_all_leave_requests(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.LeaveRequest, models.User.name.label("owner_name"))\
             .join(models.User, models.LeaveRequest.owner_id == models.User.id)\
             .order_by(models.LeaveRequest.created_at.desc()).offset(skip).limit(limit).all()

def update_leave_request_status(db: Session, request_id: int, status: str, reviewer: models.User):
    db_request = get_leave_request(db, request_id)
    if not db_request:
        return None
    
    old_status = db_request.status
    db_request.status = status
    db_request.reviewed_by_id = reviewer.id
    db.commit()
    db.refresh(db_request)

    create_audit_log(
        db,
        actor=reviewer,
        action="UPDATE_LEAVE_REQUEST",
        details=f"Changed leave request status from '{old_status}' to '{status}'.",
        target_type="LEAVE_REQUEST",
        target_id=str(db_request.id)
    )
    
    return db_request

# ==================
#  AttendanceRecord CRUD (NEW)
# ==================

def create_check_in(db: Session, user_id: int):
    """Creates a new attendance record for the day or returns an existing one."""
    today = date.today()
    # Check if a record for this user and date already exists
    db_record = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.user_id == user_id,
        models.AttendanceRecord.date == today
    ).first()

    if db_record:
        return db_record # User is already checked in for today

    # Create a new record
    db_record = models.AttendanceRecord(user_id=user_id, date=today)
    db.add(db_record)
    db.commit()
    db.refresh(db_record)
    return db_record

def create_check_out(db: Session, user_id: int):
    """Finds today's attendance record and adds a check-out time."""
    today = date.today()
    db_record = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.user_id == user_id,
        models.AttendanceRecord.date == today
    ).first()

    if db_record and not db_record.check_out_time:
        db_record.check_out_time = date.today()
        db.commit()
        db.refresh(db_record)
    
    return db_record

def get_attendance_records(db: Session, start_date: date, end_date: date):
    """Gets all attendance records within a date range, joining with user names."""
    return db.query(models.AttendanceRecord, models.User.name.label("user_name"))\
             .join(models.User, models.AttendanceRecord.user_id == models.User.id)\
             .filter(models.AttendanceRecord.date.between(start_date, end_date))\
             .order_by(models.AttendanceRecord.date.desc(), models.User.name).all()
