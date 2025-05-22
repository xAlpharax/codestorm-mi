from flask import Flask, jsonify # Keep basic Flask and jsonify for error handlers
from flask_cors import CORS
import logging # Keep logging import for direct use if any, or for initial setup access

# Configuration (centralized)
from .config import FLASK_PORT, FLASK_DEBUG_MODE

# Logging Setup (centralized)
from .logging_config import setup_logging

# Initialize Logger (call setup_logging once)
# This logger instance can be obtained in other modules via logging.getLogger("EduAPI")
logger = setup_logging() # logger is now configured and available

# Redis Utilities (pools, connection getters, teardown)
from .redis_utils import init_redis_pools, register_teardown as register_redis_teardown

# Import Blueprints
from .materials_routes import materials_bp
from .pdf_handler_routes import pdf_bp
from .quiz_routes import quiz_bp
from .assignment_routes import assignment_bp
from .legacy_routes import legacy_bp
# from .utils import utils_bp # If you create a utils blueprint

# --- Application Factory Pattern (Optional but good for scaling) ---
# For now, direct app creation is fine as it's not overly complex yet.
# def create_app():
# app = Flask(__name__)
# ... setup ...
# return app

app = Flask(__name__)

# --- Configurations ---
# app.config.from_object('backend.config_module') # Example if using Flask config objects

# --- CORS ---
CORS(app) # Enable CORS for all routes; specific origins can be configured if needed

# --- Redis Pool Initialization ---
# This is critical and should happen before app runs or first request.
try:
    init_redis_pools() # Initializes global redis_pool and binary_redis_pool
    logger.info("Redis connection pools initialized successfully.")
except ConnectionError as e:
    logger.critical(f"Failed to initialize Redis pools during app setup: {e}", exc_info=True)
    # Depending on strategy, you might exit or try to run without Redis (not recommended for this app)
    exit(1) # Exit if Redis pools can't be initialized

# --- Request Teardown ---
# Register Redis connection teardown to clean up flask.g
register_redis_teardown(app)

# --- Error Handlers (Generic) ---
# These remain in the main app file to catch errors application-wide.
@app.errorhandler(400)
def bad_request(e):
    # Note: e.description is provided by Flask's abort()
    logger.warning(f"Bad request: {e.description if hasattr(e, 'description') else str(e)}")
    return jsonify(error=str(e.description if hasattr(e, 'description') else "Bad Request")), 400

@app.errorhandler(404)
def not_found(e):
    logger.warning(f"Not found: {e.description if hasattr(e, 'description') else str(e)}")
    return jsonify(error=str(e.description if hasattr(e, 'description') else "Resource not found")), 404

@app.errorhandler(500)
def internal_server_error(e):
    # For 500 errors, e.description might not always be set by abort,
    # could be a generic Exception.
    logger.error(f"Internal server error: {e.description if hasattr(e, 'description') else str(e)}", exc_info=True)
    return jsonify(error=str(e.description if hasattr(e, 'description') else "Internal Server Error")), 500

@app.errorhandler(503)
def service_unavailable(e):
    logger.error(f"Service unavailable: {e.description if hasattr(e, 'description') else str(e)}", exc_info=True)
    return jsonify(error=str(e.description if hasattr(e, 'description') else "Service Unavailable")), 503

# --- Register Blueprints ---
API_PREFIX = "/api/v1"
app.register_blueprint(materials_bp, url_prefix=f"{API_PREFIX}/materials")
app.register_blueprint(pdf_bp, url_prefix=f"{API_PREFIX}/pdfs") # Changed from /materials/pdf to /pdfs for clarity
app.register_blueprint(quiz_bp, url_prefix=f"{API_PREFIX}/quizzes")
app.register_blueprint(assignment_bp, url_prefix=f"{API_PREFIX}/assignments")
app.register_blueprint(legacy_bp, url_prefix=f"{API_PREFIX}/legacy") # For /brasov-cursuri
# app.register_blueprint(utils_bp, url_prefix='/utils') # Example with prefix

# --- CORS Headers Function (Moved to be a general response utility if needed by error handlers directly) ---
# Flask-CORS should handle headers for Blueprint routes automatically.
# This might be needed if error handlers are bypassing CORS or for OPTIONS on error paths.
def add_cors_headers(response):
    # These headers are often set by Flask-CORS, but explicitly adding them
    # here ensures they are present, especially if Flask-CORS is configured restrictively.
    if 'Access-Control-Allow-Origin' not in response.headers:
        response.headers.add('Access-Control-Allow-Origin', '*')
    if 'Access-Control-Allow-Headers' not in response.headers:
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    if 'Access-Control-Allow-Methods' not in response.headers:
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

# Apply CORS headers to error responses explicitly if Flask-CORS doesn't cover them
# (Often, Flask-CORS does cover them if configured globally)
@app.after_request
def after_request_func(response):
    # This function can be used to add headers to all responses,
    # but Flask-CORS(app) should already be handling this for blueprint routes.
    # If error handlers are not getting CORS headers, this is one place to add them.
    # However, it's usually better to ensure Flask-CORS is configured correctly.
    # For now, let's assume Flask-CORS handles this.
    # If issues arise, uncomment and adapt:
    # return add_cors_headers(response)
    return response


# --- Main Execution ---
if __name__ == '__main__':
    logger.info(f"--- Starting Flask Web Server on http://0.0.0.0:{FLASK_PORT} ---")
    # Note: Redis pools are initialized above, before app.run
    # For production, use a proper WSGI server like Gunicorn or uWSGI.
    app.run(host='0.0.0.0', port=FLASK_PORT, debug=FLASK_DEBUG_MODE)
