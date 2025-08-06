from fastapi import Depends, FastAPI, HTTPException, status, File, UploadFile
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from typing import List
from datetime import date

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
    user_data['has_face_descriptor'] = (user_model.azure_person_id is not None)
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
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    created_user = crud.create_user(db=db, user=user, actor=current_user)
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
            crud.update_user(db, user_id=user_id, user_update=schemas.UserUpdate(azure_person_id=person_id), actor=current_user)
        
        image_data = await file.read()
        face_service.add_face_to_person(person_id=person_id, image_stream=image_data)
        
        crud.register_user_face(db, user_id=user_id, actor=current_user)
        
        updated_user = crud.get_user(db, user_id=user_id)
        return map_user_to_schema(updated_user)

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Azure face registration failed: {str(e)}")


@app.get("/company/", response_model=schemas.Company)
def read_company(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    company = crud.get_company(db)
    if company is None:
        # If no company profile exists, create a default one
        default_company_data = schemas.CompanyUpdate(
            name="Default Company",
            address="Not Set",
            location=schemas.Location(lat=0.0, lng=0.0)
        )
        company = crud.create_or_update_company(db, company=default_company_data, actor=current_user)

    # *** CORRECTED SECTION: Manually build the response schema to match Pydantic model ***
    return schemas.Company(
        id=company.id,
        name=company.name,
        address=company.address,
        location=schemas.Location(lat=company.location_lat, lng=company.location_lng),
        created_at=company.created_at,
        updated_at=company.updated_at
    )


@app.put("/company/", response_model=schemas.Company)
def update_company_profile(company_update: schemas.CompanyUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role != "Super Admin":
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return crud.create_or_update_company(db, company=company_update, actor=current_user)


@app.get("/projects/", response_model=List[schemas.Project])
def read_projects(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    return crud.get_projects(db)


@app.put("/projects/{project_id}", response_model=schemas.Project)
def update_project_details(project_id: str, project_update: schemas.ProjectCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "Admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
        
    db_project = crud.update_project(db, project_id=project_id, project_update=project_update, actor=current_user)
    if db_project is None:
        return crud.create_project(db, project=project_update, actor=current_user)
    return db_project


@app.get("/audit-logs/{target_type}/{target_id}", response_model=List[schemas.AuditLog])
def get_logs_for_target(target_type: str, target_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "Admin", "HR"]:
        raise HTTPException(status_code=403, detail="Not enough permissions to view audit logs")
    
    logs = crud.get_audit_logs_for_target(db, target_type=target_type.upper(), target_id=target_id)
    return logs

@app.post("/leave-requests/", response_model=schemas.LeaveRequest, status_code=status.HTTP_201_CREATED)
def create_leave_request(request: schemas.LeaveRequestCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    return crud.create_leave_request(db=db, request=request, owner_id=current_user.id)

@app.get("/leave-requests/me", response_model=List[schemas.LeaveRequest])
def read_my_leave_requests(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    return crud.get_leave_requests_by_owner(db, owner_id=current_user.id)

@app.get("/leave-requests/", response_model=List[schemas.LeaveRequest])
def read_all_leave_requests(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "Admin", "HR"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    requests_with_names = crud.get_all_leave_requests(db)
    return [
        schemas.LeaveRequest(
            **request.__dict__,
            owner_name=owner_name
        ) for request, owner_name in requests_with_names
    ]

@app.put("/leave-requests/{request_id}", response_model=schemas.LeaveRequest)
def update_leave_request(request_id: int, request_update: schemas.LeaveRequestUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "Admin", "HR"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    updated_request = crud.update_leave_request_status(db, request_id=request_id, status=request_update.status, reviewer=current_user)
    if not updated_request:
        raise HTTPException(status_code=404, detail="Leave request not found")
    
    return updated_request

@app.post("/attendance/check-in", response_model=schemas.AttendanceRecord)
async def check_in(db: Session = Depends(get_db), file: UploadFile = File(...), current_user: models.User = Depends(get_current_active_user)):
    if not current_user.azure_person_id:
        raise HTTPException(status_code=400, detail="No face registered for this user. Cannot check in.")
    
    try:
        image_data = await file.read()
        result = face_service.verify_face(
            person_id=current_user.azure_person_id,
            image_stream=image_data
        )
        if not result.get("is_identical"):
            raise HTTPException(status_code=401, detail=f"Face verification failed. Confidence: {result.get('confidence', 0)}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Face verification failed: {str(e)}")
    
    record = crud.create_check_in(db, user_id=current_user.id)
    return record

@app.post("/attendance/check-out", response_model=schemas.AttendanceRecord)
def check_out(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    record = crud.create_check_out(db, user_id=current_user.id)
    if not record:
        raise HTTPException(status_code=404, detail="No active check-in found for today.")
    return record

@app.get("/attendance/report", response_model=List[schemas.AttendanceRecord])
def get_attendance_report(start_date: date, end_date: date, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "Admin", "HR"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
        
    records_with_names = crud.get_attendance_records(db, start_date=start_date, end_date=end_date)
    return [
        schemas.AttendanceRecord(
            **record.__dict__,
            user_name=user_name
        ) for record, user_name in records_with_names
    ]

@app.post("/workflow-templates/", response_model=schemas.WorkflowTemplate, status_code=status.HTTP_201_CREATED)
def create_workflow_template(template: schemas.WorkflowTemplateCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "HR"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return crud.create_workflow_template(db=db, template=template)

@app.get("/workflow-templates/", response_model=List[schemas.WorkflowTemplate])
def read_workflow_templates(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    return crud.get_workflow_templates(db)

@app.post("/workflow-instances/", response_model=schemas.WorkflowInstance)
def create_workflow_instance(instance: schemas.WorkflowInstanceCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "HR"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    db_instance = crud.create_workflow_instance(db=db, instance=instance, actor=current_user)
    if not db_instance:
        raise HTTPException(status_code=404, detail="Template not found")
    return get_workflow_instance_details(instance_id=db_instance.id, db=db, current_user=current_user)

@app.get("/workflow-instances/", response_model=List[schemas.WorkflowInstance])
def read_workflow_instances(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    db_instances = crud.get_workflow_instances(db)
    response = []
    for instance in db_instances:
        response.append(get_workflow_instance_details(instance_id=instance.id, db=db, current_user=current_user))
    return response

@app.get("/workflow-instances/{instance_id}", response_model=schemas.WorkflowInstance)
def get_workflow_instance_details(instance_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    db_instance = crud.get_workflow_instance(db, instance_id=instance_id)
    if not db_instance:
        raise HTTPException(status_code=404, detail="Workflow instance not found")

    user = crud.get_user(db, user_id=db_instance.user_id)
    template = db.query(models.WorkflowTemplate).filter(models.WorkflowTemplate.id == db_instance.template_id).first()
    
    tasks = []
    for task in db_instance.tasks:
        completed_by_name = crud.get_user(db, user_id=task.completed_by_id).name if task.completed_by_id else None
        tasks.append(schemas.WorkflowTask(
            id=task.id,
            title=task.title,
            status=task.status,
            completed_at=task.completed_at,
            completed_by_name=completed_by_name
        ))

    return schemas.WorkflowInstance(
        id=db_instance.id,
        user_id=user.id,
        user_name=user.name,
        template_name=template.name,
        status=db_instance.status,
        created_at=db_instance.created_at,
        tasks=tasks
    )

@app.put("/workflow-tasks/{task_id}", response_model=schemas.WorkflowTask)
def update_workflow_task(task_id: int, task_update: schemas.WorkflowTaskUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    updated_task = crud.update_workflow_task_status(db, task_id=task_id, status=task_update.status, actor=current_user)
    if not updated_task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return schemas.WorkflowTask(
        id=updated_task.id,
        title=updated_task.title,
        status=updated_task.status,
        completed_at=updated_task.completed_at,
        completed_by_name=current_user.name
    )
