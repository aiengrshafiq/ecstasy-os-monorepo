from sqlalchemy.orm import Session
from . import models, schemas
from .auth import get_password_hash

# ==================
#  AuditLog CRUD (NEW)
# ==================

def create_audit_log(db: Session, actor: models.User, action: str, details: str, target_type: str = None, target_id: str = None):
    """
    Creates a new audit log entry in the database.
    """
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
    """
    Retrieves all audit logs for a specific target (e.g., a specific user).
    """
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
    
    # Create audit log for user creation
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
    
    # --- Generate detailed audit log message ---
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
    
    # This function is now just for logging, the azure_person_id is saved in update_user
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
        # Compare and log changes for update
        if db_company.name != company.name:
            change_details.append(f"Changed name from '{db_company.name}' to '{company.name}'.")
            db_company.name = company.name
        if db_company.address != company.address:
            change_details.append(f"Changed address from '{db_company.address}' to '{company.address}'.")
            db_company.address = company.address
        # (Location changes could be logged here as well if needed)
        db_company.location_lat = company.location.lat
        db_company.location_lng = company.location.lng
    else:
        # Log creation
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