import os
import re
import shutil
import uuid # Used for generating unique filenames (optional but recommended)
from pathlib import Path
from typing import Annotated # Use Annotated for FastAPI >= 0.95.0

from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Body
from fastapi.middleware.cors import CORSMiddleware
# Import field_validator for Pydantic V2+
from pydantic import BaseModel, HttpUrl, Field, field_validator

import base64
import os
import time
from google import genai
from google.genai import types

from dotenv import load_dotenv
load_dotenv()

client = genai.Client(
    api_key=os.environ.get("GEMINI_API_KEY"),
)

# --- Configuration ---
# Define path relative to the script file for robustness
SCRIPT_DIR = Path(__file__).resolve().parent
UPLOAD_DIRECTORY = SCRIPT_DIR / "uploads"
CHUNK_SIZE = 1024 * 1024  # 1 MB chunks for file reading
# Regex to validate YouTube video URLs (handles various formats)
YOUTUBE_REGEX = r"^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:\S+)?$"

# --- Create upload directory if it doesn't exist ---
try:
    UPLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)
except OSError as e:
    print(f"Error creating upload directory {UPLOAD_DIRECTORY}: {e}")
    # Depending on requirements, you might want to exit or raise here
    # exit(1) # Or raise SystemExit()

# --- Pydantic Model for YouTube Link Input (Updated) ---
class YouTubeLinkRequest(BaseModel):
    url: HttpUrl # Keep existing URL validation
    language: str = Field(
        ..., # Ellipsis makes it required
        description="Target language code (e.g., 'en', 'fn', 'es', 'de', 'ro').",
        examples=["en", "fr", "es", "de", "ro"]
        )
    task: str = Field(
        ..., # Ellipsis makes it required
        description="The specific task to be performed with the video.",
        examples=["summarize", "transcribe", "explain", "latex"]
        )

    # Keep the custom validator for the URL
    @field_validator('url')
    @classmethod
    def validate_youtube_url(cls, value: HttpUrl):
        """Custom validator to ensure the URL matches the YouTube pattern."""
        url_str = str(value)
        if not re.match(YOUTUBE_REGEX, url_str):
            raise ValueError("URL must be a valid YouTube video link.")
        return value

# --- FastAPI App Instance ---
app = FastAPI(title="Video and Link Uploader")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow requests from any origin
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"],  # Allow all headers
)

# --- Helper Function for Unique Filenames (Optional) ---
def get_unique_filename(original_filename: str) -> str:
    """Generates a unique filename while preserving the extension."""
    ext = Path(original_filename).suffix
    unique_id = uuid.uuid4()
    return f"{unique_id}{ext}"

# --- Root Endpoint (Optional) ---
@app.get("/")
async def read_root():
    """Simple root endpoint to confirm the API is running."""
    return {"message": "Welcome to the Video and Link Uploader API"}

# --- Endpoint 1: Video File Upload ---
@app.post("/upload/video/")
async def upload_video(
    video: UploadFile = File(..., description="The video file to upload."),
    language: str = Form(..., description="Target language code (e.g., 'en', 'fn', 'es', 'de', 'ro').", examples=["en", "fr", "es", "de", "ro"]),
    task: str = Form(..., description="The specific task to be performed with the video (e.g., 'summarize', 'transcribe', 'explain', 'latex').", examples=["summarize", "transcribe","explain", "latex"])
):
    """
    Uploads a video file.

    The file is saved to the server in the 'uploads' directory
    relative to the script location.
    """
    if not video.filename:
         raise HTTPException(status_code=400, detail="No filename provided.")

    if not video.content_type or not video.content_type.startswith("video/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Only video files are allowed.")

    # Basic sanitization using Path().name to get just the filename part
    # Consider using get_unique_filename() for better collision avoidance
    safe_filename = Path(video.filename).name
    # Construct the full absolute path for saving
    file_path = UPLOAD_DIRECTORY / safe_filename

    try:
        # Save the file chunk by chunk to handle large files efficiently
        with open(file_path, "wb") as buffer:
            while chunk := await video.read(CHUNK_SIZE):
                buffer.write(chunk)

    except Exception as e:
        # Clean up partial file if upload fails
        if file_path.exists():
            try:
                file_path.unlink()
            except OSError:
                 # Ignore errors during cleanup attempt, log if necessary
                 pass
        raise HTTPException(status_code=500, detail=f"Could not save file: {e}")
    finally:
        await video.close() # Ensure the file handle is closed

    # Construct a simple relative path string for the response
    # This assumes the 'uploads' directory is served or known by the client
    relative_save_path_str = f"{UPLOAD_DIRECTORY.name}/{safe_filename}"
    print(f"File saved to: {relative_save_path_str}")

    generate_response = generate(mode="video", task=task, file=file_path, language=language)

    return {
        "message": "Video uploaded successfully",
        "filename": safe_filename,
        "content_type": video.content_type,
        "saved_path": relative_save_path_str,
        "language": language,
        "task": task,
        "response": generate_response
    }

# --- Endpoint 2: YouTube Link Upload ---
@app.post("/upload/youtube/")
async def upload_youtube_link(
    link_data: YouTubeLinkRequest = Body(..., description="JSON body containing the YouTube URL.")
):
    """
    Receives and validates a YouTube video link.

    Ensures the provided URL string points to a standard YouTube video.
    """
    # The Pydantic model with the custom field_validator performs the validation.
    # If the code reaches here, the link is valid according to the model.

    url_str = str(link_data.url) # Convert validated HttpUrl back to string

    language_code = str(link_data.language)
    task_description = str(link_data.task)

    # Extract the video ID using the regex (optional, but can be useful)
    match = re.search(YOUTUBE_REGEX, url_str)
    video_id = match.group(1) if match else None # Get the captured group (the ID)

    generate_response = generate(mode="youtube", task=task_description, file=None, language=language_code, video_link=url_str)

    return {
        "message": "Valid YouTube link received.",
        "received_url": url_str,
        "extracted_video_id": video_id,
        "language": language_code,
        "task": task_description,
        "response": generate_response
    }

def generate(mode = "youtube", task = "summarize", file = None, language = "en", video_link = None):

    model = "gemini-2.0-flash-thinking-exp-01-21"

    if task == "summarize":
        if language == "en":
            question = "Can you summarize this video?"
        elif language == "fr":
            question = "Peux-tu résumer cette vidéo?"
        elif language == "es":
            question = "¿Puedes resumir este video?"
        elif language == "de":
            question = "Kannst du dieses Video zusammenfassen?"
        elif language == "ro":
            question = "Poți rezuma acest videoclip?"

    if task == "transcribe":
        if language == "en":
            question = "Transcribe the audio from this video, giving timestamps for salient events in the video. Also provide visual descriptions."
        elif language == "fr":
            question = "Transcris le son de cette vidéo, en donnant des horodatages pour les événements saillants de la vidéo. Fournis également des descriptions visuelles."
        elif language == "es":
            question = "Transcribe el audio de este video, dando marcas de tiempo para los eventos destacados en el video. También proporciona descripciones visuales."
        elif language == "de":
            question = "Transkribiere den Ton dieses Videos und gib Zeitstempel für die herausragenden Ereignisse im Video an. Gib auch visuelle Beschreibungen an."
        elif language == "ro":
            question = "Transcrie sunetul acestui videoclip, oferind marcaje de timp pentru evenimentele importante din videoclip. Oferă și descrieri vizuale."

    if task == "explain":
        if language == "en":
            question = "Tell me about this video",
        elif language == "fr":
            question = "Parle-moi de cette vidéo"
        elif language == "es":
            question = "Háblame de este video"
        elif language == "de":
            question = "Erzähl mir von diesem Video"
        elif language == "ro":
            question = "Spune-mi despre acest videoclip"

    if task == "latex":
        if language == "en":
            question = "Generate a latex document from this video."
        elif language == "fr":
            question = "Générer un document latex à partir de cette vidéo."
        elif language == "es":
            question = "Generar un documento latex a partir de este video."
        elif language == "de":
            question = "Generieren Sie ein latex-Dokument aus diesem Video."
        elif language == "ro":
            question = "Generați un document latex din acest video."

    if mode == "youtube" and video_link:
        contents = [
            types.Content(
                parts=[
                    types.Part(text=str(question)),
                    types.Part(
                        file_data=types.FileData(file_uri=str(video_link))
                    )
                ]
            ),
        ]

    elif mode == "video" and file:

        print("Uploading file...")
        video_file = client.files.upload(file=file)
        print(f"Completed upload: {video_file.uri}")

        # Check whether the file is ready to be used.
        while video_file.state.name == "PROCESSING":
            print('.', end='')
            time.sleep(1)
            video_file = client.files.get(name=video_file.name)

        if video_file.state.name == "FAILED":
          raise ValueError(video_file.state.name)

        print('Done')

        contents = [
            video_file,
            question,
        ]

    else:
        return "Invalid mode or missing file"

    generate_content_config = types.GenerateContentConfig(
        response_mime_type="text/plain",
        temperature=0.7,
    )

    return_text = ""
    for chunk in client.models.generate_content_stream(
        model=model,
        contents=contents,
        config=generate_content_config,
    ):
        return_text += str(chunk.text)
        print(chunk.text, end="")

    return return_text
