import os
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any
import logging
import shutil # For efficient file copying
from pathlib import Path
import uuid # For generating unique filenames (optional but recommended)

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

import os
import subprocess
from pathlib import Path

def citeste_fisier_ca_string(cale_fisier):
    """
    Citește întregul conținut al unui fișier și îl returnează ca un singur string.

    Args:
        cale_fisier (str): Calea către fișierul care trebuie citit.

    Returns:
        str: Conținutul fișierului ca string, sau None dacă apare o eroare.
             De asemenea, tipărește un mesaj de eroare în consolă în caz de eșec.
    """
    try:
        # Verifică dacă calea există și este un fișier
        if not os.path.exists(cale_fisier):
            print(f"Eroare: Fișierul nu există la calea: {cale_fisier}")
            return None
        if not os.path.isfile(cale_fisier):
            print(f"Eroare: Calea specificată nu este un fișier: {cale_fisier}")
            return None

        # Folosește 'with' pentru a asigura închiderea automată a fișierului
        # Specifică 'encoding='utf-8'' pentru a gestiona corect caracterele speciale (diacritice, etc.)
        # Poți schimba 'utf-8' cu alt encoding dacă fișierul tău folosește altceva (ex: 'latin-1', 'cp1252')
        with open(cale_fisier, 'r', encoding='utf-8') as f:
            continut = f.read() # Citește tot conținutul fișierului într-un singur string
        return continut
    except FileNotFoundError:
        # Deși am verificat cu os.path.exists, e bine să prindem și excepția specifică
        print(f"Eroare: Fișierul nu a fost găsit (verificare dublă): {cale_fisier}")
        return None
    except IOError as e:
        # Prinde erori legate de permisiuni sau alte probleme I/O (Input/Output)
        print(f"Eroare I/O la citirea fișierului {cale_fisier}: {e}")
        return None
    except UnicodeDecodeError as e:
        # Eroare dacă encoding-ul specificat ('utf-8') nu e corect pentru fișier
        print(f"Eroare de decodare (encoding) la citirea fișierului {cale_fisier}. Încercați alt encoding? Eroare: {e}")
        return None
    except Exception as e:
        # Prinde orice altă eroare neașteptată
        print(f"A apărut o eroare neașteptată la citirea fișierului {cale_fisier}: {e}")
        return None

latex_template_ro = citeste_fisier_ca_string("template_latex_ro.txt")
latex_template_en = citeste_fisier_ca_string("template_latex_en.txt")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="File Upload API with Saving",
    description="An API to upload one or more files (PDF, images, etc.) and save them.",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow requests from any origin
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"],  # Allow all headers
)

# --- Define where to save files ---
SCRIPT_DIR = Path(__file__).resolve().parent # Get directory of the script
UPLOAD_DIRECTORY = SCRIPT_DIR / "uploads"  # Create 'uploads' dir in script's directory

# --- Create upload directory if it doesn't exist ---
try:
    UPLOAD_DIRECTORY.mkdir(parents=True, exist_ok=True)
except OSError as e:
    print(f"Error creating upload directory {UPLOAD_DIRECTORY}: {e}")
    # Depending on requirements, you might want to exit or raise here
    # exit(1) # Or raise SystemExit()

# --- Helper Function for Unique Filenames (Optional but Recommended) ---
def get_unique_filename(original_filename: str) -> str:
    """Generates a unique filename while preserving the extension."""
    ext = Path(original_filename).suffix
    unique_id = uuid.uuid4()
    return f"{unique_id}{ext}"

# Optional: Add a root endpoint for basic check
@app.get("/")
async def read_root():
    return {"message": "File Upload API with Saving is running. Use the /uploadfiles/ endpoint to upload files."}

@app.post("/uploadfiles/", response_model=Dict[str, Any])
async def upload_multiple_files(
    files: List[UploadFile] = File(..., description="One or more files to upload (PDF, JPG, PNG, HEIC, etc.)"),
    language: str = Form(..., description="Target language code (e.g., 'en', 'fn', 'es', 'de', 'ro').", examples=["en", "fr", "es", "de", "ro"]),
    task: str = Form(..., description="The specific task to be performed with the video (e.g., 'format', 'solve', 'help', 'explain').", examples=["format", "solve", "help", "explain"])
):

    """
    Receives one or more files via POST request and saves them to the 'uploads' directory.

    Returns a JSON response confirming the saved files and their details.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files were sent.")

    saved_files_info = []
    filenames = []
    file_paths = []

    logger.info(f"Received request to upload {len(files)} file(s).")

    for file in files:
        file_info = {
            "filename": file.filename,
            "content_type": file.content_type,
            "saved_path": None, # Initially no saved path
            "error": None, # Initially no error
        }
        try:
            # Basic validation (optional but recommended)
            if not file.filename:
                 logger.warning("Received a file without a filename.")
                 file_info["error"] = "No filename provided"
                 saved_files_info.append(file_info)
                 continue # Skip this file

            # --- Save the file ---
            # Generate a unique filename to avoid collisions (optional)
            unique_filename = get_unique_filename(file.filename)
            file_location = UPLOAD_DIRECTORY / unique_filename  # Construct full path
            file_paths.append(file_location)

            try:
                with open(file_location, "wb") as f:
                    shutil.copyfileobj(file.file, f) # Efficiently copy file content
                logger.info(f"Successfully saved {file.filename} as {unique_filename} to {file_location}")
                file_info["saved_path"] = str(file_location) # Save the path as string
                filenames.append(file.filename)

            except Exception as save_error:
                logger.error(f"Failed to save file {file.filename} to {file_location}: {save_error}")
                file_info["error"] = f"Could not save file: {save_error}"
                # You might want to handle save errors differently, e.g., raise HTTPException
                # if saving is critical. For now, just log the error.

        except Exception as e:
            logger.error(f"Error processing file {getattr(file, 'filename', 'unknown')}: {e}")
            file_info["error"] = f"File processing error: {e}"
            # Handle other processing errors if needed

        finally:
            await file.close() # Ensure the file is closed after processing
            saved_files_info.append(file_info)

    # SEND FILES TO GEMINI
    generate_response = generate(mode="latex", task=task, files=file_paths, language=language)

    response_data = {
        "message": f"Successfully processed {len(saved_files_info)} file(s).",
        "saved_files": saved_files_info,
        "task": task,
        "language": language,
        "latex_code": generate_response,
    }

    logger.info(f"Sending response for filenames: {filenames}")
    return JSONResponse(content=response_data, status_code=200)

def generate(mode = "latex", task = "format", files = None, language = "en"):

    model = "gemini-2.0-flash-thinking-exp-01-21"

    if task == "format":
        if language == "en":
            question = f"""You are the world's best LaTeX writer for courses and pleasantly looking documents. You get content from the pdf or images that the user gives you and you return back the full latex code needed for it. You may add things yourself like completions of the shortened handwritten words or add further explainations in plain language, etc. what is needed in order for the final result to look nice. Make sure to check and double check everything that you write so that it makes perfect mathemtaical reason for it to be there in the way that you write it. When making tikz graphs, double check that the figures are correct and that the letters or other content won't overlap. Always aim for the most pretty looking document you can make and most well made and readable good to look at latex document.

Use this template and give back the full latex code:
{latex_template_en}

The macros, letterfonts and preamble files are already included in the template. You can use them as you like. You need to give me back the full main.tex file with the content in it.
"""
        elif language == "ro":
            question = f"""Ești cel mai bun scriitor LaTeX din lume pentru cursuri și documente plăcute. Obții conținut din pdf sau imagini pe care utilizatorul ți le oferă și returnezi codul latex complet necesar pentru acesta. Poți adăuga lucruri de genul completărilor cu cuvinte scrise de mână prescurtat sau adăuga explicații suplimentare în limbaj simplu, etc. ceea ce este necesar pentru ca rezultatul final să arate bine. Asigură-te că verifici și recitești tot ce scrii astfel încât să aibă un raționament matematic perfect pentru a fi acolo în modul în care îl scrii. Când faci grafice tikz, verifică dublu că figurile sunt corecte și că literele sau alte conținuturi nu se vor suprapune. Vizează întotdeauna cel mai frumos document pe care îl poți face și cel mai bine realizat și lizibil document latex de privit.

Folosește acest template și dă înapoi întregul cod latex:
{latex_template_ro}

Macros, letterfonts și fișierele de preambul sunt deja incluse în template. Le poți folosi după cum dorești. Trebuie să îmi dai înapoi întregul fișier main.tex cu conținutul în el.
"""

    elif task == "solve":
        if language == "en":
            question = f"""You are an AI Math teacher assistant helping students solve homeworks by being clear and helpful while tackling problems step by step, avoid solving all problems in one response, instead solve a problem at a time per response so that you can emphasize steps better and that information is better digested.

Avoid using tags like sup or sub, make use of math rendering with latex. Use $ and $$ when appropriate.

Use this template and give back the full latex code:
{latex_template_en}

The macros, letterfonts and preamble files are already included in the template. You can use them as you like. You need to give me back the full main.tex file with the content in it.
"""
        elif language == "ro":
            question = f"""Ești un asistent AI profesor de matematică care ajută studenții să rezolve teme fiind clar și util în timp ce abordezi problemele pas cu pas. Evită să rezolvi toate problemele într-un singur răspuns, în schimb rezolvă o problemă pe rând per răspuns, astfel încât să poți sublinia mai bine pașii și informația să fie mai bine asimilată.

Evită folosirea etichetelor precum sup sau sub, folosește redarea matematică cu LaTeX. Folosește $ și $$ $$ atunci când este cazul.

Folosește acest template și dă înapoi întregul cod latex:
{latex_template_ro}

Macros, letterfonts și fișierele de preambul sunt deja incluse în template. Le poți folosi după cum dorești. Trebuie să îmi dai înapoi întregul fișier main.tex cu conținutul în el.
"""

    elif task == "help":
        if language == "en":
            question = f"""You are an AI Math teacher assistant helping students study for math exams by being clear and helpful while tackling problems step by step, avoid solving all problems in one response, instead solve a problem at a time per response so that you can emphasize steps better and that information is better digested.

Avoid using tags like sup or sub, make use of math rendering with latex. Use $ and $$ when appropriate.

Use this template and give back the full latex code:
{latex_template_en}

The macros, letterfonts and preamble files are already included in the template. You can use them as you like. You need to give me back the full main.tex file with the content in it.
"""
        elif language == "ro":
            question = f"""Ești un asistent AI profesor de matematică care ajută studenții să se pregătească pentru examenele de matematică fiind clar și util în timp ce abordezi problemele pas cu pas. Evită să rezolvi toate problemele într-un singur răspuns, în schimb rezolvă o problemă pe rând per răspuns, astfel încât să poți sublinia mai bine pașii și informația să fie mai bine asimilată.

Evită folosirea etichetelor precum sup sau sub, folosește redarea matematică cu LaTeX. Folosește $ și $$ $$ atunci când este cazul.

Folosește acest template și dă înapoi întregul cod latex:
{latex_template_ro}

Macros, letterfonts și fișierele de preambul sunt deja incluse în template. Le poți folosi după cum dorești. Trebuie să îmi dai înapoi întregul fișier main.tex cu conținutul în el.
"""

    elif task == "explain":
        if language == "en":
            question = f"""You are an AI Math teacher assistant helping students study for math exams by being clear and helpful while tackling problems step by step, avoid solving all problems in one response, instead solve a problem at a time per response so that you can emphasize steps better and that information is better digested.

Avoid using tags like sup or sub, make use of math rendering with latex. Use $ and $$ when appropriate.

Explain the submitted materials as best as you can.

Use this template and give back the full latex code:
{latex_template_en}

The macros, letterfonts and preamble files are already included in the template. You can use them as you like. You need to give me back the full main.tex file with the content in it.
"""
        elif language == "ro":
            question = f"""Ești un asistent AI profesor de matematică care ajută studenții să se pregătească pentru examenele de matematică fiind clar și util în timp ce abordezi problemele pas cu pas. Evită să rezolvi toate problemele într-un singur răspuns, în schimb rezolvă o problemă pe rând per răspuns, astfel încât să poți sublinia mai bine pașii și informația să fie mai bine asimilată.

Evită folosirea etichetelor precum sup sau sub, folosește redarea matematică cu LaTeX. Folosește $ și $$ $$ atunci când este cazul.

Explică materialele trimise cât mai bine posibil.

Folosește acest template și dă înapoi întregul cod latex:
{latex_template_ro}

Macros, letterfonts și fișierele de preambul sunt deja incluse în template. Le poți folosi după cum dorești. Trebuie să îmi dai înapoi întregul fișier main.tex cu conținutul în el.
"""

    else:
        raise ValueError("Invalid task")

    if mode == "latex" and files:

        contents = []
        for file in files:
            # file_path = Path(file)

            print("Uploading file...")
            new_file = client.files.upload(file=file)
            print(f"Completed upload: {new_file.uri}")

            # Check whether the file is ready to be used.
            while new_file.state.name == "PROCESSING":
                print('.', end='')
                time.sleep(1)
                new_file = client.files.get(name=new_file.name)

            if new_file.state.name == "FAILED":
              raise ValueError(new_file.state.name)

            contents.append(new_file)
            print('Done')

        contents.append(question)

    else:
        return "Invalid mode or missing file"

    generate_content_config = types.GenerateContentConfig(
        response_mime_type="text/plain",
        temperature=0,
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
