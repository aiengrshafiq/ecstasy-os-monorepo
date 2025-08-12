# services/svc-hrms-core/app/main.py

from fastapi import Depends, FastAPI, HTTPException, status, File, UploadFile
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from fastapi.middleware.cors import CORSMiddleware
from jose import JWTError, jwt
from typing import List
from datetime import date, timedelta
import calendar

# --- MODIFIED: Import rekognition_service instead of face_service ---
from . import auth, crud, models, schemas, rekognition_service
from .database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

# --- MODIFIED: Application Startup Event to use Rekognition ---
@app.on_event("startup")
async def on_startup():
    rekognition_service.initialize_collection()


# --- Security & CORS (Unchanged) ---
origins = [
    "http://localhost",
    "http://localhost:8000",
    "http://127.0.0.1:5500",
    "https://ecstasyosfrontendstorage.z1.web.core.windows.net",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- MODIFIED: Helper function to map User model to User schema ---
def map_user_to_schema(user_model: models.User) -> schemas.User:
    user_data = schemas.User.from_orm(user_model).dict()
    user_data['has_face_descriptor'] = (user_model.rekognition_face_id is not None)
    return schemas.User(**user_data)

# --- THIS IS THE MISSING FUNCTION ---
def map_project_to_schema(project_model: models.Project) -> schemas.Project:
    """Helper function to correctly format the project response."""
    return schemas.Project(
        id=project_model.id,
        name=project_model.name,
        status=project_model.status,
        location=schemas.Location(lat=project_model.location_lat, lng=project_model.location_lng),
        created_at=project_model.created_at,
        updated_at=project_model.updated_at
    )

# --- Dependency for getting current user (Unchanged) ---
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

# ... (Token, User creation, etc. remain unchanged) ...

@app.post("/token", response_model=schemas.Token)
async def login_for_access_token(db: Session = Depends(get_db), form_data: OAuth2PasswordRequestForm = Depends()):
    user = crud.get_user_by_email(db, email=form_data.username)
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
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


# --- MODIFIED: /register-face endpoint to use Rekognition ---
@app.post("/users/{user_id}/register-face", response_model=schemas.User)
async def register_face(user_id: int, db: Session = Depends(get_db), file: UploadFile = File(...), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "Admin", "HR"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    db_user = crud.get_user(db, user_id=user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # A user can only have one face registered.
    if db_user.rekognition_face_id:
        raise HTTPException(status_code=400, detail="User already has a registered face. Please remove it first to add a new one.")

    try:
        image_data = await file.read()
        # Index the face in the Rekognition collection
        face_id = rekognition_service.index_face(image_bytes=image_data)

        # Save the returned FaceId to the user's profile
        crud.update_user(db, user_id=user_id, user_update=schemas.UserUpdate(rekognition_face_id=face_id), actor=current_user)
        
        # Log this action
        crud.register_user_face(db, user_id=user_id, actor=current_user)
        
        updated_user = crud.get_user(db, user_id=user_id)
        return map_user_to_schema(updated_user)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Amazon Rekognition failed: {str(e)}")


# --- MODIFIED: /check-in endpoint to use Rekognition ---
@app.post("/attendance/check-in", response_model=schemas.AttendanceRecord)
async def check_in(db: Session = Depends(get_db), file: UploadFile = File(...), current_user: models.User = Depends(get_current_active_user)):
    if not current_user.rekognition_face_id:
        raise HTTPException(status_code=400, detail="No face registered for this user.")

    try:
        image_data = await file.read()
        # Search for the face in the collection
        matched_face_id = rekognition_service.search_for_face(image_bytes=image_data)

        # Verify if the matched face belongs to the current user
        if matched_face_id != current_user.rekognition_face_id:
            # This is a critical security check. The face matched someone, but not the person logged in.
            raise HTTPException(status_code=401, detail="Face verification failed. The detected face does not belong to the logged-in user.")

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Face verification failed: {str(e)}")

    # If verification is successful, create the check-in record
    record = crud.create_check_in(db, user_id=current_user.id)
    return record


# ... (All other endpoints for Company, Projects, Audit, Leave, Workflows, and Payroll remain unchanged) ...
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
    
    # The crud function returns the updated SQLAlchemy model object
    updated_company_model = crud.create_or_update_company(db, company=company_update, actor=current_user)

    # Manually build the Pydantic response model from the SQLAlchemy object
    return schemas.Company(
        id=updated_company_model.id,
        name=updated_company_model.name,
        address=updated_company_model.address,
        location=schemas.Location(lat=updated_company_model.location_lat, lng=updated_company_model.location_lng),
        created_at=updated_company_model.created_at,
        updated_at=updated_company_model.updated_at
    )

@app.get("/projects/", response_model=List[schemas.Project])
def read_projects(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    projects = crud.get_projects(db)
    # Use the helper function to map each project
    return [map_project_to_schema(p) for p in projects]

# --- CORRECTED: This endpoint now also manually builds the response ---
@app.put("/projects/{project_id}", response_model=schemas.Project)
def update_project_details(project_id: str, project_update: schemas.ProjectCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "Admin"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    
    # Check if the project exists to decide whether to create or update
    db_project_model = crud.get_project(db, project_id=project_id)
    
    if db_project_model:
        # Update existing project
        updated_project_model = crud.update_project(db, project_id=project_id, project_update=project_update, actor=current_user)
        return map_project_to_schema(updated_project_model)
    else:
        # Create new project
        new_project_model = crud.create_project(db, project=project_update, actor=current_user)
        return map_project_to_schema(new_project_model)

@app.get("/audit-logs/{target_type}/{target_id}", response_model=List[schemas.AuditLog])
def get_logs_for_target(target_type: str, target_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "Admin", "HR"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return crud.get_audit_logs_for_target(db, target_type=target_type.upper(), target_id=target_id)

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
    return [schemas.LeaveRequest(**request.__dict__, owner_name=owner_name) for request, owner_name in requests_with_names]

@app.put("/leave-requests/{request_id}", response_model=schemas.LeaveRequest)
def update_leave_request(request_id: int, request_update: schemas.LeaveRequestUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "Admin", "HR"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    updated_request = crud.update_leave_request_status(db, request_id=request_id, status=request_update.status, reviewer=current_user)
    if not updated_request:
        raise HTTPException(status_code=404, detail="Leave request not found")
    return updated_request

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
    return [schemas.AttendanceRecord(**record.__dict__, user_name=user_name) for record, user_name in records_with_names]

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
        tasks.append(schemas.WorkflowTask(id=task.id, title=task.title, status=task.status, completed_at=task.completed_at, completed_by_name=completed_by_name))
    return schemas.WorkflowInstance(id=db_instance.id, user_id=user.id, user_name=user.name, template_name=template.name, status=db_instance.status, created_at=db_instance.created_at, tasks=tasks)

@app.put("/workflow-tasks/{task_id}", response_model=schemas.WorkflowTask)
def update_workflow_task(task_id: int, task_update: schemas.WorkflowTaskUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    updated_task = crud.update_workflow_task_status(db, task_id=task_id, status=task_update.status, actor=current_user)
    if not updated_task:
        raise HTTPException(status_code=404, detail="Task not found")
    return schemas.WorkflowTask(id=updated_task.id, title=updated_task.title, status=updated_task.status, completed_at=updated_task.completed_at, completed_by_name=current_user.name)

@app.post("/salaries/", response_model=schemas.Salary)
def create_or_update_salary(salary: schemas.SalaryCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "HR"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return crud.create_or_update_salary(db=db, salary=salary, actor=current_user)

@app.get("/salaries/{user_id}", response_model=schemas.Salary)
def read_salary_for_user(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "HR"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    salary = crud.get_current_salary_for_user(db, user_id=user_id)
    if not salary:
        raise HTTPException(status_code=404, detail="Salary information not found for this user.")
    return salary

@app.post("/bank-details/", response_model=schemas.BankDetails)
def create_or_update_bank_details(details: schemas.BankDetailsCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "HR"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return crud.create_or_update_bank_details(db=db, details=details, actor=current_user)

@app.get("/bank-details/{user_id}", response_model=schemas.BankDetails)
def read_bank_details_for_user(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "HR"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    bank_details = crud.get_bank_details_for_user(db, user_id=user_id)
    if not bank_details:
        raise HTTPException(status_code=404, detail="Bank details not found for this user.")
    return bank_details

@app.post("/payroll/run/{year}/{month}", response_model=List[schemas.Payslip])
def run_payroll_for_month(year: int, month: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "HR"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    start_date = date(year, month, 1)
    end_date = date(year, month, calendar.monthrange(year, month)[1])

    all_users = crud.get_users(db, limit=1000) # Get all users
    generated_payslips = []

    for user in all_users:
        salary = crud.get_current_salary_for_user(db, user_id=user.id)
        if not salary:
            continue # Skip users without salary info

        deductions = 0.0
        unpaid_leave_requests = db.query(models.LeaveRequest).filter(
            models.LeaveRequest.owner_id == user.id,
            models.LeaveRequest.leave_type == "Unpaid",
            models.LeaveRequest.status == "Approved",
            models.LeaveRequest.start_date <= end_date,
            models.LeaveRequest.end_date >= start_date
        ).all()

        daily_rate = salary.gross_salary / 30 # Simplified daily rate
        for req in unpaid_leave_requests:
            overlap_start = max(req.start_date, start_date)
            overlap_end = min(req.end_date, end_date)
            if overlap_end >= overlap_start:
                unpaid_days = (overlap_end - overlap_start).days + 1
                deductions += unpaid_days * daily_rate

        net_salary = salary.gross_salary - deductions

        payslip_data = schemas.PayslipBase(
            pay_period_start=start_date,
            pay_period_end=end_date,
            gross_salary=salary.gross_salary,
            deductions=round(deductions, 2),
            net_salary=round(net_salary, 2),
            status="Generated"
        )
        payslip = crud.create_payslip(db, payslip_data=payslip_data, user_id=user.id)
        generated_payslips.append(payslip)

    return generated_payslips

@app.get("/payslips/me", response_model=List[schemas.Payslip])
def read_my_payslips(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    return crud.get_payslips_for_user(db, user_id=current_user.id)

@app.get("/payslips/{year}/{month}", response_model=List[schemas.Payslip])
def read_payslips_for_period(year: int, month: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_active_user)):
    if current_user.role not in ["Super Admin", "HR"]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    start_date = date(year, month, 1)
    end_date = date(year, month, calendar.monthrange(year, month)[1])

    payslips_with_names = crud.get_all_payslips_for_period(db, start_date=start_date, end_date=end_date)
    return [
        schemas.Payslip(
            **payslip.__dict__,
            user_name=user_name
        ) for payslip, user_name in payslips_with_names
    ]
