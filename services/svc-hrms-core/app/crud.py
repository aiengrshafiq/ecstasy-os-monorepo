# services/svc-hrms-core/app/crud.py

from sqlalchemy.orm import Session, joinedload
from datetime import date, datetime
from . import models, schemas
from .auth import get_password_hash

# ==================
#  AuditLog CRUD
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
#  User CRUD
# ==================

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def get_users(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.User).order_by(models.User.name).offset(skip).limit(limit).all()

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
#  Company CRUD
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
#  Project CRUD
# ==================

# --- NEW FUNCTION: Added to get a single project by its ID ---
def get_project(db: Session, project_id: str):
    return db.query(models.Project).filter(models.Project.id == project_id).first()

def get_projects(db: Session):
    return db.query(models.Project).order_by(models.Project.name).all()

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
    db_project = get_project(db, project_id=project_id) # Now this function exists
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
    
    # Always commit location changes, even if other details haven't changed
    db.commit()
    db.refresh(db_project)
    
    if change_details:
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
#  LeaveRequest CRUD
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
#  AttendanceRecord CRUD
# ==================

def create_check_in(db: Session, user_id: int):
    today = date.today()
    db_record = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.user_id == user_id,
        models.AttendanceRecord.date == today
    ).first()

    if db_record:
        return db_record

    db_record = models.AttendanceRecord(user_id=user_id, date=today)
    db.add(db_record)
    db.commit()
    db.refresh(db_record)
    return db_record

def create_check_out(db: Session, user_id: int):
    today = date.today()
    db_record = db.query(models.AttendanceRecord).filter(
        models.AttendanceRecord.user_id == user_id,
        models.AttendanceRecord.date == today
    ).first()

    if db_record and not db_record.check_out_time:
        db_record.check_out_time = datetime.now()
        db.commit()
        db.refresh(db_record)
    
    return db_record

def get_attendance_records(db: Session, start_date: date, end_date: date):
    return db.query(models.AttendanceRecord, models.User.name.label("user_name"))\
        .join(models.User, models.AttendanceRecord.user_id == models.User.id)\
        .filter(models.AttendanceRecord.date.between(start_date, end_date))\
        .order_by(models.AttendanceRecord.date.desc(), models.User.name).all()

# ==================
#  Workflow & Task CRUD
# ==================
def create_workflow_template(db: Session, template: schemas.WorkflowTemplateCreate):
    db_template = models.WorkflowTemplate(name=template.name, type=template.type)
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    
    for i, task_schema in enumerate(template.tasks):
        db_task = models.TemplateTask(
            template_id=db_template.id,
            title=task_schema.title,
            description=task_schema.description,
            default_assignee_role=task_schema.default_assignee_role,
            order=i
        )
        db.add(db_task)
    
    db.commit()
    return db_template

def get_workflow_templates(db: Session):
    return db.query(models.WorkflowTemplate).options(joinedload(models.WorkflowTemplate.tasks)).all()

def create_workflow_instance(db: Session, instance: schemas.WorkflowInstanceCreate, actor: models.User):
    template = db.query(models.WorkflowTemplate).options(joinedload(models.WorkflowTemplate.tasks)).filter(models.WorkflowTemplate.id == instance.template_id).first()
    if not template:
        return None

    db_instance = models.WorkflowInstance(template_id=instance.template_id, user_id=instance.user_id)
    db.add(db_instance)
    db.commit()
    db.refresh(db_instance)

    for template_task in template.tasks:
        db_task = models.WorkflowTask(
            instance_id=db_instance.id,
            template_task_id=template_task.id,
            title=template_task.title
        )
        db.add(db_task)
    
    db.commit()
    
    user = get_user(db, user_id=instance.user_id)
    create_audit_log(db, actor, "WORKFLOW_STARTED", f"Started '{template.name}' workflow for user '{user.name}'.", "USER", str(user.id))
    
    return db_instance

def get_workflow_instances(db: Session):
    return db.query(models.WorkflowInstance).all()

def get_workflow_instance(db: Session, instance_id: int):
    return db.query(models.WorkflowInstance).options(joinedload(models.WorkflowInstance.tasks)).filter(models.WorkflowInstance.id == instance_id).first()

def update_workflow_task_status(db: Session, task_id: int, status: str, actor: models.User):
    db_task = db.query(models.WorkflowTask).filter(models.WorkflowTask.id == task_id).first()
    if not db_task:
        return None
    
    db_task.status = status
    db_task.completed_by_id = actor.id
    db_task.completed_at = datetime.now()
    db.commit()
    db.refresh(db_task)
    
    create_audit_log(db, actor, "TASK_COMPLETED", f"Completed task: '{db_task.title}'.", "WORKFLOW_INSTANCE", str(db_task.instance_id))
    
    return db_task

# ==================
#  Payroll CRUD
# ==================

def create_or_update_salary(db: Session, salary: schemas.SalaryCreate, actor: models.User):
    db.query(models.Salary).filter(models.Salary.user_id == salary.user_id).update({"is_current": False})
    
    db_salary = models.Salary(**salary.dict(), is_current=True)
    db.add(db_salary)
    db.commit()
    db.refresh(db_salary)

    user = get_user(db, user_id=salary.user_id)
    create_audit_log(db, actor, "SALARY_UPDATE", f"Set salary for '{user.name}' to {salary.gross_salary} effective {salary.effective_date}.", "USER", str(user.id))
    
    return db_salary

def get_current_salary_for_user(db: Session, user_id: int):
    return db.query(models.Salary).filter(models.Salary.user_id == user_id, models.Salary.is_current == True).first()

def create_or_update_bank_details(db: Session, details: schemas.BankDetailsCreate, actor: models.User):
    db_details = db.query(models.BankDetails).filter(models.BankDetails.user_id == details.user_id).first()
    
    if db_details:
        db_details.bank_name = details.bank_name
        db_details.account_number = details.account_number
        db_details.iban = details.iban
    else:
        db_details = models.BankDetails(**details.dict())
        db.add(db_details)
        
    db.commit()
    db.refresh(db_details)

    user = get_user(db, user_id=details.user_id)
    create_audit_log(db, actor, "BANK_DETAILS_UPDATE", f"Updated bank details for '{user.name}'.", "USER", str(user.id))
    
    return db_details

def get_bank_details_for_user(db: Session, user_id: int):
    return db.query(models.BankDetails).filter(models.BankDetails.user_id == user_id).first()

def create_payslip(db: Session, payslip_data: schemas.PayslipBase, user_id: int):
    db_payslip = models.Payslip(**payslip_data.dict(), user_id=user_id)
    db.add(db_payslip)
    db.commit()
    db.refresh(db_payslip)
    return db_payslip

def get_payslips_for_user(db: Session, user_id: int):
    return db.query(models.Payslip).filter(models.Payslip.user_id == user_id).order_by(models.Payslip.pay_period_end.desc()).all()

def get_all_payslips_for_period(db: Session, start_date: date, end_date: date):
    return db.query(models.Payslip, models.User.name.label("user_name"))\
        .join(models.User, models.Payslip.user_id == models.User.id)\
        .filter(models.Payslip.pay_period_start >= start_date, models.Payslip.pay_period_end <= end_date)\
        .order_by(models.User.name).all()
