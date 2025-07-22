import os
from dotenv import load_dotenv
from azure.core.credentials import AzureKeyCredential
# *** CORRECTED IMPORTS: We need both clients now ***
from azure.ai.vision.face import FaceClient, FaceAdministrationClient

# Load environment variables
load_dotenv()

# --- Azure Face Service Configuration ---
AZURE_FACE_ENDPOINT = os.getenv("AZURE_FACE_ENDPOINT")
AZURE_FACE_KEY = os.getenv("AZURE_FACE_KEY")

PERSON_GROUP_ID = "ecstasy_os_employees"

# --- Initialize BOTH Azure Clients ---
try:
    # This client is for MANAGING person groups and persons (Create, Delete, etc.)
    face_admin_client = FaceAdministrationClient(endpoint=AZURE_FACE_ENDPOINT, credential=AzureKeyCredential(AZURE_FACE_KEY))
    
    # This client is for ANALYSIS (Detecting, Verifying faces)
    face_client = FaceClient(endpoint=AZURE_FACE_ENDPOINT, credential=AzureKeyCredential(AZURE_FACE_KEY))
except Exception as e:
    print(f"Error initializing Azure Clients: {e}")
    face_admin_client = None
    face_client = None

# --- Service Functions ---

def initialize_person_group():
    """
    Checks if the Person Group exists on Azure, and creates it if it doesn't.
    This should be run when the application starts up.
    *** TEMPORARILY MODIFIED to prevent crash while waiting for Azure approval. ***
    """
    print("--- AZURE FACE API IS IN SIMULATION MODE ---")
    print(f"Simulating check for Person Group '{PERSON_GROUP_ID}'.")
    # The original code is commented out below to be restored later.
    # if not face_admin_client:
    #     print("FaceAdministrationClient is not initialized. Cannot create person group.")
    #     return
    # try:
    #     face_admin_client.large_person_group.get(large_person_group_id=PERSON_GROUP_ID)
    #     print(f"Person group '{PERSON_GROUP_ID}' already exists.")
    # except Exception:
    #     print(f"Person group '{PERSON_GROUP_ID}' not found, creating it now.")
    #     face_admin_client.large_person_group.create(
    #         large_person_group_id=PERSON_GROUP_ID,
    #         name=PERSON_GROUP_ID,
    #         recognition_model="recognition_04"
    #     )
    #     print("Person group created successfully.")
    return

def create_person_in_group(name: str) -> str:
    """
    Creates a new "Person" in our Azure Person Group.
    *** TEMPORARILY MODIFIED to return a fake ID. ***
    """
    print(f"Simulating creation of person '{name}' in Azure.")
    # The original code is commented out below.
    # if not face_admin_client:
    #     raise Exception("FaceAdministrationClient is not initialized.")
    # created_person = face_admin_client.large_person_group_person.create(
    #     large_person_group_id=PERSON_GROUP_ID,
    #     name=name
    # )
    # return created_person.person_id
    import uuid
    fake_person_id = str(uuid.uuid4())
    print(f"Generated fake Azure Person ID: {fake_person_id}")
    return fake_person_id


def add_face_to_person(person_id: str, image_stream) -> str:
    """
    Uploads an image and adds the detected face to a specific person in Azure.
    *** TEMPORARILY MODIFIED to simulate success. ***
    """
    print(f"Simulating adding a face to person {person_id}.")
    # The original code is commented out below.
    # if not face_admin_client:
    #     raise Exception("FaceAdministrationClient is not initialized.")
    # added_face = face_admin_client.large_person_group_person.add_face_from_stream(
    #     large_person_group_id=PERSON_GROUP_ID,
    #     person_id=person_id,
    #     image_content=image_stream,
    #     detection_model="detection_03"
    # )
    # face_admin_client.large_person_group.train(large_person_group_id=PERSON_GROUP_ID)
    # print(f"Training initiated for person group '{PERSON_GROUP_ID}'.")
    # return added_face.persisted_face_id
    import uuid
    fake_persisted_face_id = str(uuid.uuid4())
    print(f"Generated fake Persisted Face ID: {fake_persisted_face_id}")
    return fake_persisted_face_id

# --- NEW FUNCTION ---
def verify_face(person_id: str, image_stream) -> dict:
    """
    Verifies a face in an image against a registered person in Azure.
    *** SIMULATION MODE ENABLED ***

    Args:
        person_id: The Azure person_id of the registered user.
        image_stream: The new image data to verify.

    Returns:
        A dictionary containing verification status and confidence.
    """
    print(f"Simulating face verification for person {person_id}.")
    # In a real scenario, you would detect the face in the new image,
    # then call the verify endpoint with the new faceId and the user's personId.
    
    # For now, we just return a successful simulation result.
    return {"is_identical": True, "confidence": 0.95}