from fastapi import Depends, FastAPI, HTTPException, status, File, UploadFile
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from typing import List

from . import auth, crud, models, schemas, face_service
from .database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

# --- Application Startup Event ---
@app.on_event("startup")
async def on_startup():
    face_service.initialize_person_group()


# --- Security & CORS ---
origins = [
    "http://localhost",
    "http://localhost:8000",
    "http://127.0.0.1:5500",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- Helper function to map User model to User schema ---
def map_user_to_schema(user_model: models.User) -> schemas.User:
    user_data = schemas.User.from_orm(user_model).dict()
    #user_data['has_face_descriptor'] = (user_model.face_descriptor is not None) or (user_model.azure_person_id is not None)
    return schemas.User(**user_data)

# --- Dependency for getting current user ---
async def get_current_active_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, auth.SECRET_KEY, algorithms=[auth.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
        token_data = schemas.TokenData(email=email)
    except JWTError:
        raise credentials_exception
    
    user = crud.get_user_by_email(db, email=token_data.email)
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


# ===================================================================
# API ENDPOINTS
# ===================================================================

@app.post("/token", response_model=schemas.Token)
async def login_for_access_token(db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    user = crud.get_user_by_email(db, email=form_data.username)
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}


@app.post("/users/", response_model=schemas.User, status_code=status.HTTP_201_CREATED)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    created_user = crud.create_user(db=db, user=user)
    return map_user_to_schema(created_user)


@app.get("/users/me/", response_model=schemas.User)
async def read_users_me(current_user: models.User = Depends(get_current_active_user)):
    return map_user_to_schema(current_user)


@app.get("/users/", response_model=List[schemas.User])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    users = crud.get_users(db, skip=skip, limit=limit)
    return [map_user_to_schema(user) for user in users]


@app.put("/users/{user_id}", response_model=schemas.User)
def update_user_profile(user_id: int, user_update: schemas.UserUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    #updated_user = crud.update_user(db, user_id=user_id, user_update=user_update)
    updated_user = crud.update_user(db, user_id=user_id, user_update=user_update, actor=current_user)
    if updated_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return map_user_to_schema(updated_user)


@app.post("/users/{user_id}/register-face", response_model=schemas.User)
async def register_face(user_id: int, db: Session = Depends(get_db), file: UploadFile = File(...), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "Admin", "HR"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    db_user = crud.get_user(db, user_id=user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        person_id = db_user.azure_person_id
        if not person_id:
            person_id = face_service.create_person_in_group(name=db_user.name)
            #crud.update_user(db, user_id=user_id, user_update=schemas.UserUpdate(azure_person_id=person_id))
            crud.update_user(db, user_id=user_id, user_update=schemas.UserUpdate(azure_person_id=person_id), actor=current_user)
        
        image_data = await file.read()
        face_service.add_face_to_person(person_id=person_id, image_stream=image_data)
        updated_user = crud.get_user(db, user_id=user_id)
        return map_user_to_schema(updated_user)

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Azure face registration failed: {str(e)}")


@app.get("/company/", response_model=schemas.Company)
def read_company(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    company = crud.get_company(db)
    if company is None:
        default_company_data = schemas.CompanyUpdate(
            name="Default Company",
            address="Not Set",
            location=schemas.Location(lat=0.0, lng=0.0)
        )
        company = crud.create_or_update_company(db, company=default_company_data)

    return schemas.Company(
        id=company.id,
        name=company.name,
        address=company.address,
        location=schemas.Location(lat=company.location_lat, lng=company.location_lng)
    )

@app.put("/company/", response_model=schemas.Company)
def update_company_profile(company_update: schemas.CompanyUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role != "Super Admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    updated_company = crud.create_or_update_company(db, company=company_update)
    return schemas.Company(
        id=updated_company.id,
        name=updated_company.name,
        address=updated_company.address,
        location=schemas.Location(lat=updated_company.location_lat, lng=updated_company.location_lng)
    )


@app.get("/projects/", response_model=List[schemas.Project])
def read_projects(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    projects = crud.get_projects(db)
    return [schemas.Project(
        id=p.id,
        name=p.name,
        location=schemas.Location(lat=p.location_lat, lng=p.location_lng)
    ) for p in projects]


@app.put("/projects/{project_id}", response_model=schemas.Project)
def update_project_details(project_id: str, project_update: schemas.ProjectCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "Admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
        
    updated_project = crud.update_project(db, project_id=project_id, project_update=project_update)
    if updated_project is None:
        created_project = crud.create_project(db, project=project_update)
        return schemas.Project(
            id=created_project.id,
            name=created_project.name,
            location=schemas.Location(lat=created_project.location_lat, lng=created_project.location_lng)
        )
        
    return schemas.Project(
        id=updated_project.id,
        name=updated_project.name,
        location=schemas.Location(lat=updated_project.location_lat, lng=updated_project.location_lng)
    )

# --- NEW ENDPOINT ---
@app.post("/attendance/verify-face")
async def verify_check_in_face(db: Session = Depends(get_db), file: UploadFile = File(...), current_user: models.User = Depends(get_current_active_user)):
    """
    Verifies the face of the currently logged-in user for check-in.
    """
    if not current_user.azure_person_id:
        raise HTTPException(status_code=400, detail="No face registered for this user.")

    try:
        image_data = await file.read()
        result = face_service.verify_face(
            person_id=current_user.azure_person_id,
            image_stream=image_data
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Face verification failed: {str(e)}")


# --- NEW ENDPOINT for Audit Logs ---
@app.get("/audit-logs/{target_type}/{target_id}", response_model=List[schemas.AuditLog])
def get_logs_for_target(target_type: str, target_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    """
    Retrieves the history of changes for a specific target (e.g., a USER or PROJECT).
    """
    if current_user.role not in ["Super Admin", "Admin", "HR"]:
        raise HTTPException(status_code=403, detail="Not enough permissions to view audit logs")
    
    logs = crud.get_audit_logs_for_target(db, target_type=target_type.upper(), target_id=target_id)
    return logs