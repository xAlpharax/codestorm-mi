from pydantic import BaseModel, Field, HttpUrl # HttpUrl can be used if URLs are expected
from typing import Optional, List, Dict, Any # For more complex types if needed

# --- General Purpose Models ---
class SuccessResponse(BaseModel):
    success: bool = True
    message: Optional[str] = None

class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    details: Optional[List[Dict[str, Any]]] = None # For Pydantic validation errors

# --- Materials Routes Models ---
class MaterialUploadRequest(BaseModel):
    text: str = Field(..., min_length=1)

class MaterialSyncNameRequest(BaseModel):
    key: str = Field(..., min_length=1)

class MaterialDeleteRequest(BaseModel):
    key: str = Field(..., min_length=1)

class MaterialSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    limit: Optional[int] = Field(10, gt=0, le=100) # Example: default 10, must be >0, <=100

class MaterialUploadPDFRequest(BaseModel): # For the text part of PDF upload
    text: str = Field(..., min_length=1)
    # filename: Optional[str] = None # If you want to pass filename in JSON body

class SyncAllMaterialsRequest(BaseModel):
    force_rename: Optional[bool] = False

# --- Quiz Routes Models ---
class QuizGenerateRequest(BaseModel):
    topic: str = Field(..., min_length=1)

class QuizSaveRequest(BaseModel):
    xml: str = Field(..., min_length=1)
    topic: str = Field(..., min_length=1)

class QuizDeleteRequest(BaseModel):
    key: str = Field(..., min_length=1)

# --- Assignment Routes Models ---
class AssignmentSaveRequest(BaseModel):
    xml: str = Field(..., min_length=1)
    topic: str = Field(..., min_length=1)

class AssignmentDeleteRequest(BaseModel):
    key: str = Field(..., min_length=1)

# --- Response Models (Optional, but good for consistency) ---
# Example for a single material item
class MaterialItem(BaseModel):
    id: str
    content: str
    name: str
    has_pdf: bool

class MaterialListResponse(BaseModel):
    success: bool = True
    documents: List[MaterialItem]

# Example for a single quiz item
class QuizItem(BaseModel):
    key: str
    topic: str
    timestamp: int
    xml: str

class QuizListResponse(BaseModel):
    success: bool = True
    quizzes: List[QuizItem]

# Example for a single assignment item
class AssignmentItem(BaseModel):
    key: str
    topic: str
    timestamp: int
    xml: str

class AssignmentListResponse(BaseModel):
    success: bool = True
    assignments: List[AssignmentItem]

# Example for search results
class MaterialSearchResultItem(BaseModel):
    text: str
    title: str
    timestamp: int
    key: str
    name: str
    has_pdf: bool
    score: float

class MaterialSearchResponse(BaseModel):
    materials: List[MaterialSearchResultItem]
    count: int

# Example for generated quiz
class ParsedQuizOption(BaseModel):
    text: str
    correct: bool

class ParsedQuizQuestion(BaseModel):
    id: str
    type: str
    text: str
    options: List[ParsedQuizOption]

class ParsedQuiz(BaseModel):
    topic: str
    questions: List[ParsedQuizQuestion]

class QuizGenerateResponse(BaseModel):
    success: bool = True
    quizXml: str
    parsedQuiz: ParsedQuiz
