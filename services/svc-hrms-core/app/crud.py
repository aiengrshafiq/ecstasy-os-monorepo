from sqlalchemy.orm import Session
from . import models, schemas
from .auth import get_password_hash # We will create this file next

# ==================
#  User CRUD
# ==================

def get_user(db: Session, user_id: int):
    """
    Reads a single user from the database by their ID.
    """
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_email(db: Session, email: str):
    """
    Reads a single user from the database by their email.
    """
    return db.query(models.User).filter(models.User.email == email).first()

def get_users(db: Session, skip: int = 0, limit: int = 100):
    """
    Reads a list of users from the database with pagination.
    """
    return db.query(models.User).offset(skip).limit(limit).all()

def create_user(db: Session, user: schemas.UserCreate):
    """
    Creates a new user in the database.
    Hashes the password before storing.
    """
    hashed_password = get_password_hash(user.password)
    db_user = models.User(
        email=user.email,
        name=user.name,
        hashed_password=hashed_password,
        role=user.role,
        # Add other fields as needed
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user(db: Session, user_id: int, user_update: schemas.UserUpdate):
    """
    Updates an existing user's profile.
    """
    db_user = get_user(db, user_id)
    if not db_user:
        return None
    
    update_data = user_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_user, key, value)
        
    db.commit()
    db.refresh(db_user)
    return db_user

# ==================
#  Company CRUD
# ==================

def get_company(db: Session):
    """
    Reads the single company profile from the database.
    """
    return db.query(models.Company).filter(models.Company.id == 1).first()

def create_or_update_company(db: Session, company: schemas.CompanyUpdate):
    """
    Creates or updates the company profile. Since there is only one,
    this function handles both cases.
    """
    db_company = get_company(db)
    if db_company:
        # Update existing
        db_company.name = company.name
        db_company.address = company.address
        db_company.location_lat = company.location.lat
        db_company.location_lng = company.location.lng
    else:
        # Create new
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
    return db_company

# ==================
#  Project CRUD
# ==================

def get_projects(db: Session):
    """
    Reads all projects from the database.
    """
    return db.query(models.Project).all()

def create_project(db: Session, project: schemas.ProjectCreate):
    """
    Creates a new project.
    """
    db_project = models.Project(
        id=project.id,
        name=project.name,
        location_lat=project.location.lat,
        location_lng=project.location.lng
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    return db_project

def update_project(db: Session, project_id: str, project_update: schemas.ProjectCreate):
    """
    Updates an existing project.
    """
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        return None
        
    db_project.name = project_update.name
    db_project.location_lat = project_update.location.lat
    db_project.location_lng = project_update.location.lng
    
    db.commit()
    db.refresh(db_project)
    return db_project