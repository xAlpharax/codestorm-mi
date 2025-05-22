import pytest
from pydantic import ValidationError
from typing import Optional # Required for some model tests

# Import all models from the backend.models module
# Assuming the test file is run from a context where 'backend' is a package
# If running directly, sys.path manipulation might be needed, but for pytest, this should work if backend is discoverable
from backend.models import (
    SuccessResponse,
    ErrorResponse,
    MaterialUploadRequest,
    MaterialSyncNameRequest,
    MaterialDeleteRequest,
    MaterialSearchRequest,
    MaterialUploadPDFRequest,
    SyncAllMaterialsRequest,
    QuizGenerateRequest,
    QuizSaveRequest,
    QuizDeleteRequest,
    AssignmentSaveRequest,
    AssignmentDeleteRequest,
    # Response models are not explicitly tested for validation errors here,
    # but their instantiation can be tested for correctness if needed.
)

# Instructions to run tests:
# 1. Ensure pytest is installed: pip install pytest
# 2. Navigate to the `web-interface/` directory (parent of the `backend` directory) in your terminal.
# 3. Run the command: pytest 
#    This will discover and run all tests in `backend/tests/`, including:
#    - tests/test_models.py
#    - tests/test_redis_utils.py
#    - tests/test_vector_db_utils.py
#
#    Alternatively, to run a specific file (from `web-interface/` directory):
#    pytest backend/tests/test_models.py
#    pytest backend/tests/test_redis_utils.py
#    pytest backend/tests/test_vector_db_utils.py
#
#    Or, if inside `web-interface/backend/` directory:
#    pytest tests/test_models.py 
#    (and so on for other files)

# --- Test General Purpose Models ---

def test_success_response_valid():
    """Test SuccessResponse with valid data."""
    response = SuccessResponse()
    assert response.success is True
    assert response.message is None

    response_with_msg = SuccessResponse(message="Operation successful")
    assert response_with_msg.success is True
    assert response_with_msg.message == "Operation successful"

def test_error_response_valid():
    """Test ErrorResponse with valid data."""
    response = ErrorResponse(error="An error occurred")
    assert response.success is False
    assert response.error == "An error occurred"
    assert response.details is None

    details = [{"loc": ["field"], "msg": "is required", "type": "value_error.missing"}]
    response_with_details = ErrorResponse(error="Validation error", details=details)
    assert response_with_details.success is False
    assert response_with_details.error == "Validation error"
    assert response_with_details.details == details

# --- Test Materials Routes Models ---

def test_material_upload_request_valid():
    data = MaterialUploadRequest(text="Some valid material text.")
    assert data.text == "Some valid material text."

def test_material_upload_request_invalid():
    with pytest.raises(ValidationError) as excinfo:
        MaterialUploadRequest(text="") # min_length=1
    assert "text" in str(excinfo.value).lower()
    assert "ensure this value has at least 1 characters" in str(excinfo.value).lower()
    
    with pytest.raises(ValidationError):
        MaterialUploadRequest() # text is required

def test_material_sync_name_request_valid():
    data = MaterialSyncNameRequest(key="doc:item:123")
    assert data.key == "doc:item:123"

def test_material_sync_name_request_invalid():
    with pytest.raises(ValidationError):
        MaterialSyncNameRequest(key="") # min_length=1
    with pytest.raises(ValidationError):
        MaterialSyncNameRequest() # key is required

def test_material_delete_request_valid():
    data = MaterialDeleteRequest(key="doc:item:123")
    assert data.key == "doc:item:123"

def test_material_delete_request_invalid():
    with pytest.raises(ValidationError):
        MaterialDeleteRequest(key="") # min_length=1
    with pytest.raises(ValidationError):
        MaterialDeleteRequest() # key is required

def test_material_search_request_valid():
    data = MaterialSearchRequest(query="search term")
    assert data.query == "search term"
    assert data.limit == 10 # Default value

    data_with_limit = MaterialSearchRequest(query="search term", limit=5)
    assert data_with_limit.limit == 5

def test_material_search_request_invalid():
    with pytest.raises(ValidationError):
        MaterialSearchRequest(query="") # min_length=1
    
    with pytest.raises(ValidationError):
        MaterialSearchRequest(query="term", limit=0) # gt=0
        
    with pytest.raises(ValidationError):
        MaterialSearchRequest(query="term", limit=101) # le=100

    with pytest.raises(ValidationError):
        MaterialSearchRequest() # query is required

def test_material_upload_pdf_request_valid():
    data = MaterialUploadPDFRequest(text="Text extracted from PDF.")
    assert data.text == "Text extracted from PDF."

def test_material_upload_pdf_request_invalid():
    with pytest.raises(ValidationError):
        MaterialUploadPDFRequest(text="") # min_length=1
    with pytest.raises(ValidationError):
        MaterialUploadPDFRequest() # text is required

def test_sync_all_materials_request_valid():
    data_default = SyncAllMaterialsRequest()
    assert data_default.force_rename is False

    data_true = SyncAllMaterialsRequest(force_rename=True)
    assert data_true.force_rename is True

    data_false = SyncAllMaterialsRequest(force_rename=False)
    assert data_false.force_rename is False

# --- Test Quiz Routes Models ---

def test_quiz_generate_request_valid():
    data = QuizGenerateRequest(topic="Valid Topic")
    assert data.topic == "Valid Topic"

def test_quiz_generate_request_invalid():
    with pytest.raises(ValidationError):
        QuizGenerateRequest(topic="") # min_length=1
    with pytest.raises(ValidationError):
        QuizGenerateRequest() # topic is required

def test_quiz_save_request_valid():
    data = QuizSaveRequest(xml="<quiz></quiz>", topic="Quiz Topic")
    assert data.xml == "<quiz></quiz>"
    assert data.topic == "Quiz Topic"

def test_quiz_save_request_invalid():
    with pytest.raises(ValidationError):
        QuizSaveRequest(xml="", topic="Topic") # xml min_length=1
    with pytest.raises(ValidationError):
        QuizSaveRequest(xml="<quiz></quiz>", topic="") # topic min_length=1
    with pytest.raises(ValidationError):
        QuizSaveRequest() # both required

def test_quiz_delete_request_valid():
    data = QuizDeleteRequest(key="quiz:123")
    assert data.key == "quiz:123"

def test_quiz_delete_request_invalid():
    with pytest.raises(ValidationError):
        QuizDeleteRequest(key="") # min_length=1
    with pytest.raises(ValidationError):
        QuizDeleteRequest() # key is required

# --- Test Assignment Routes Models ---

def test_assignment_save_request_valid():
    data = AssignmentSaveRequest(xml="<assignment></assignment>", topic="Assignment Topic")
    assert data.xml == "<assignment></assignment>"
    assert data.topic == "Assignment Topic"

def test_assignment_save_request_invalid():
    with pytest.raises(ValidationError):
        AssignmentSaveRequest(xml="", topic="Topic") # xml min_length=1
    with pytest.raises(ValidationError):
        AssignmentSaveRequest(xml="<assignment></assignment>", topic="") # topic min_length=1
    with pytest.raises(ValidationError):
        AssignmentSaveRequest() # both required

def test_assignment_delete_request_valid():
    data = AssignmentDeleteRequest(key="assignment:123")
    assert data.key == "assignment:123"

def test_assignment_delete_request_invalid():
    with pytest.raises(ValidationError):
        AssignmentDeleteRequest(key="") # min_length=1
    with pytest.raises(ValidationError):
        AssignmentDeleteRequest() # key is required

# --- Example of testing a response model (instantiation) ---
# This is less about validation and more about ensuring they can be created.
# More complex response models might have validators or computed fields to test.

def test_material_search_request_limit_type():
    """Test that limit must be an integer if provided."""
    with pytest.raises(ValidationError) as excinfo:
        MaterialSearchRequest(query="test", limit="not-an-int")
    # Check that the error is about the 'limit' field and its type
    error_details = excinfo.value.errors()
    assert len(error_details) == 1
    assert error_details[0]['loc'] == ('limit',)
    assert 'int_parsing' in error_details[0]['type'].lower() # Pydantic v2 type

def test_sync_all_materials_request_type():
    """Test that force_rename must be a boolean if provided."""
    with pytest.raises(ValidationError) as excinfo:
        SyncAllMaterialsRequest(force_rename="not-a-bool")
    error_details = excinfo.value.errors()
    assert len(error_details) == 1
    assert error_details[0]['loc'] == ('force_rename',)
    assert 'bool_parsing' in error_details[0]['type'].lower()

# It's good practice to ensure field names in error messages are captured,
# which was done with `assert "text" in str(excinfo.value).lower()`
# For more precise error message checking, you can inspect `excinfo.value.errors()`
# which returns a list of dicts, e.g.:
# [{'loc': ('field_name',), 'msg': 'validation error message', 'type': 'error_type'}]

# Example for MaterialSearchRequest for more detailed error message check
def test_material_search_request_invalid_query_detailed():
    with pytest.raises(ValidationError) as excinfo:
        MaterialSearchRequest(query="") # min_length=1
    errors = excinfo.value.errors()
    assert len(errors) == 1
    assert errors[0]['loc'] == ('query',)
    assert 'ensure this value has at least 1 characters' in errors[0]['msg'].lower()

def test_material_search_request_invalid_limit_detailed():
    with pytest.raises(ValidationError) as excinfo:
        MaterialSearchRequest(query="test", limit=0) # gt=0
    errors = excinfo.value.errors()
    assert len(errors) == 1
    assert errors[0]['loc'] == ('limit',)
    assert 'ensure this value is greater than 0' in errors[0]['msg'].lower()

    with pytest.raises(ValidationError) as excinfo:
        MaterialSearchRequest(query="test", limit=101) # le=100
    errors = excinfo.value.errors()
    assert len(errors) == 1
    assert errors[0]['loc'] == ('limit',)
    assert 'ensure this value is less than or equal to 100' in errors[0]['msg'].lower()
