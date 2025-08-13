# services/svc-hrms-core/seed.py

import asyncio
from datetime import date
from sqlalchemy.orm import Session
from app import crud, schemas, models
from app.database import engine, SessionLocal
from app.auth import get_password_hash

# Ensure all tables are created
models.Base.metadata.create_all(bind=engine)

def seed_data():
    """
    Populates the database with initial data for testing and demonstration.
    This script should only be run once.
    """
    db: Session = SessionLocal()
    print("--- Starting Database Seeding ---")

    try:
        # 1. Check if the Super Admin already exists
        super_admin = crud.get_user_by_email(db, email="sysadmin@metamorphic.ae")
        if super_admin:
            print("Super Admin user already exists. Seeding has likely been completed before. Aborting.")
            return

        print("Creating Super Admin user...")
        # Note: The password hash is created directly here.
        # In a real app, you might handle this differently, but for seeding it's direct.
        hashed_password = get_password_hash("admin123") 
        
        db_user = models.User(
            email="sysadmin@metamorphic.ae",
            hashed_password=hashed_password,
            name="Default Admin",
            role="Super Admin",
            hiring_date=date.today()
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        print("Super Admin 'shafiq@ecstasyholding.com' created with password 'admin123'.")
        
        # We need the created admin user as the 'actor' for audit logs
        actor = db_user

        # 2. Create default Workflow Templates with tasks
        print("Creating default workflow templates...")
        
        # Define tasks for Onboarding
        onboarding_tasks = [
            schemas.TemplateTaskCreate(title="Sign Employment Contract", default_assignee_role="HR"),
            schemas.TemplateTaskCreate(title="Complete HR Paperwork", default_assignee_role="Employee"),
            schemas.TemplateTaskCreate(title="Set up IT Equipment (Laptop, Accounts)", default_assignee_role="Admin"),
            schemas.TemplateTaskCreate(title="Team Introduction Meeting", default_assignee_role="Employee"),
        ]

        # Define tasks for Offboarding
        offboarding_tasks = [
            schemas.TemplateTaskCreate(title="Knowledge Handover to Team/Manager", default_assignee_role="Employee"),
            schemas.TemplateTaskCreate(title="Return Company Assets (Laptop, ID Card)", default_assignee_role="Employee"),
            schemas.TemplateTaskCreate(title="Conduct Exit Interview", default_assignee_role="HR"),
            schemas.TemplateTaskCreate(title="Disable System Accounts", default_assignee_role="Admin"),
        ]

        templates_to_create = [
            schemas.WorkflowTemplateCreate(name="New Hire Onboarding", type="ONBOARDING", tasks=onboarding_tasks),
            schemas.WorkflowTemplateCreate(name="Employee Offboarding", type="OFFBOARDING", tasks=offboarding_tasks)
        ]

        for template_data in templates_to_create:
            existing_template = db.query(models.WorkflowTemplate).filter(models.WorkflowTemplate.name == template_data.name).first()
            if not existing_template:
                # The crud function should handle creating the template and its tasks
                crud.create_workflow_template(db, template=template_data)
                print(f"Created template: {template_data.name}")

        # 3. Create a default Company Profile
        print("Creating default company profile...")
        company_profile = crud.get_company(db)
        if not company_profile:
            company_data = schemas.CompanyUpdate(
                name="6T3 Media Partners",
                address="AL Barsha, Dubai, UAE",
                location=schemas.Location(lat=25.08, lng=55.22) # Default to Business Bay, Dubai
            )
            crud.create_or_update_company(db, company=company_data, actor=actor)
            print("Default company profile created.")

        print("\n--- Seeding Complete! ---")

    except Exception as e:
        print(f"\nAN ERROR OCCURRED: {e}")
        print("Seeding may have partially completed. Please check the database.")
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
