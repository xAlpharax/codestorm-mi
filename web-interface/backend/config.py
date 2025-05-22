import os
from dotenv import load_dotenv # Optional: to load .env file for local development

# Load environment variables from .env file if present (for local development)
load_dotenv()

# --- Redis Configuration ---
# Default to localhost and standard port if not set in environment
REDIS_HOST = os.getenv('REDIS_HOST', "127.0.0.1")
REDIS_PORT = int(os.getenv('REDIS_PORT', "6379")) # Port should be an integer
REDIS_DB = int(os.getenv('REDIS_DB', "0"))         # DB should be an integer
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD', None) # Default to None if no password

# --- Flask Application Configuration ---
FLASK_PORT = int(os.getenv('FLASK_PORT', "5020"))
# FLASK_DEBUG_MODE should be False in production. Default to True for dev.
FLASK_DEBUG_MODE_STR = os.getenv('FLASK_DEBUG_MODE', "True").lower()
FLASK_DEBUG_MODE = FLASK_DEBUG_MODE_STR == "true"

# --- External API URLs ---
# These are kept as constants if they don't contain secrets.
# If they had API keys, the base URL would be here, and keys loaded from env vars.
VECTOR_UPSERT_API_URL = os.getenv('VECTOR_UPSERT_API_URL', "https://flow.sprk.ro/api/v1/vector/upsert/9ffc4511-5216-4454-b256-10c59ddeeddc")
VECTOR_SEARCH_API_URL = os.getenv('VECTOR_SEARCH_API_URL', "https://flow.sprk.ro/api/v1/vector/search/9ffc4511-5216-4454-b256-10c59ddeeddc")
NAME_GENERATOR_API_URL = os.getenv('NAME_GENERATOR_API_URL', "https://flow.sprk.ro/api/v1/prediction/6b1424e8-987a-4ede-97fe-05d953faf3e6")
QUIZ_GENERATOR_API_URL = os.getenv('QUIZ_GENERATOR_API_URL', 'https://flow.sprk.ro/api/v1/prediction/5d18b69b-b911-4a27-b2dc-2105fd9b42ef')

# --- Application-Specific Redis Keys/Patterns (Not secrets, part of app logic) ---
KEY_PATTERN = "doc:brasov-cursuri:*" # Used in legacy_routes and find_redis_entry_by_content
TARGET_FIELD = "content" # Used in legacy_routes

# Key prefixes/patterns for Redis
PREFIX_DOC_BRASOV_CURSURI = "doc:brasov-cursuri:*"
PREFIX_DOC_BRASOV_TESTS = "doc:brasov-tests:*"
PREFIX_BRASOV_ASSIGNMENTS = "brasov-assignments:*"
PREFIX_BRASOV_QUIZZES_LEGACY_DELETE = "brasov-quizzes:" # Used in delete_quiz, might be legacy
NAME_SUFFIX_FILTER = b':name' # Used to filter out name sub-keys

# Example of how an API key would be handled:
# EXTERNAL_SERVICE_API_KEY = os.getenv('EXTERNAL_SERVICE_API_KEY', 'your_default_api_key_for_dev_if_any')
# if not EXTERNAL_SERVICE_API_KEY and not FLASK_DEBUG_MODE:
#     # In production, you might want to raise an error if a critical API key is missing
#     raise ValueError("EXTERNAL_SERVICE_API_KEY is not set in the environment for production mode.")
