from flask import Blueprint, jsonify, abort
import logging
import re # For extract_numeric_index

from .redis_utils import get_redis_connection # Assuming text content
from .config import KEY_PATTERN, TARGET_FIELD # Using the generic KEY_PATTERN from config

logger = logging.getLogger("EduAPI")
legacy_bp = Blueprint('legacy_bp', __name__)

# Helper function (originally in app.py)
def extract_numeric_index(key_name):
    """Extracts the numeric index from the key name (e.g., 'doc:brasov-cursuri:10' -> 10)."""
    match = re.search(r':(\d+)$', key_name)
    if match:
        return int(match.group(1))
    return -1 # Return -1 or raise error if format is unexpected

@legacy_bp.route('/brasov-cursuri/<start_str>/<stop_str>', methods=['GET'])
def get_brasov_cursuri_slice(start_str: str, stop_str: str):
    """
    Retrieve a slice of legacy "brasov-cursuri" documents from Redis.
    Documents are sorted by an extracted numeric index from their keys.
    This endpoint appears to be for a specific, older data structure.

    Method: GET
    URL: /brasov-cursuri/<start_str>/<stop_str> 
         (Full path: /api/v1/legacy/brasov-cursuri/<start_str>/<stop_str>)
    Parameters:
        - Path:
            - `start_str` (string, required): The starting index (0-based) for the slice. 
              Must be convertible to an integer.
            - `stop_str` (string, required): The ending index (exclusive) for the slice. 
              Must be convertible to an integer.
    Success Response (200 OK):
        Content-Type: application/json
        Body:
        A dictionary where keys are the full Redis document keys (e.g., "doc:brasov-cursuri:10")
        and values are their textual content.
        Example:
        {
            "doc:brasov-cursuri:10": "Content of document 10...",
            "doc:brasov-cursuri:11": "Content of document 11...",
            // If a document's content field (TARGET_FIELD) is missing, the value will be:
            // "<TARGET_FIELD name> field missing or null>"
        }
    Error Responses:
        400 Bad Request (via abort):
            - If `start_str` or `stop_str` cannot be converted to integers.
              Flask default JSON response, e.g., 
              {"error": "Invalid input: 'start' and 'stop' must be integers."}
            - If the range is invalid (e.g., start < 0, or stop < start).
              Flask default JSON response, e.g., 
              {"error": "Invalid range: 'start' must be non-negative and 'stop' must be >= 'start'."}
        500 Internal Server Error (via abort):
            - If there's an error communicating with Redis during key scan or content fetch.
              Flask default JSON response, e.g., 
              {"error": "Error communicating with data store for brasov-cursuri slice."}
            - For other unexpected errors during request handling.
              Flask default JSON response, e.g., 
              {"error": "An unexpected internal server error occurred."}
        503 Service Unavailable (via abort): 
            - If the Redis connection pool is not initialized (raised by `get_redis_connection`).
              Flask default JSON response, e.g., 
              {"error": "Service Unavailable: Cannot connect to backend data store."}
    """
    try:
        start = int(start_str)
        stop = int(stop_str) # User probably means inclusive, Python slice is exclusive
        if start < 0 or stop < start:
            abort(400, description="Invalid range: 'start' must be non-negative and 'stop' must be >= 'start'.")
    except ValueError:
        abort(400, description="Invalid input: 'start' and 'stop' must be integers.")

    try:
        r_text = get_redis_connection()
        logger.info(f"Scanning for keys matching pattern: {KEY_PATTERN} for brasov-cursuri slice.")
        
        keys_with_indices = []
        # Note: r.scan_iter might be slow for very large key sets without a more specific pattern.
        # KEY_PATTERN from config is "doc:brasov-cursuri:*" which is good.
        for key in r_text.scan_iter(match=KEY_PATTERN):
            index = extract_numeric_index(key)
            if index != -1:
                keys_with_indices.append((index, key))
            else:
                logger.warning(f"Could not parse index from key '{key}' in brasov-cursuri slice. Skipping.")
        
        keys_with_indices.sort(key=lambda item: item[0])
        sorted_keys = [item[1] for item in keys_with_indices]
        logger.info(f"Found and sorted {len(sorted_keys)} keys for brasov-cursuri slice.")

        keys_to_fetch = sorted_keys[start:stop] # Python slice [start:stop]
        logger.info(f"Fetching content for keys from index {start} up to (but not including) {stop}.")

        output_data = {}
        if not keys_to_fetch:
            logger.info("No keys fall within the requested range after sorting for brasov-cursuri slice.")
        else:
            pipe = r_text.pipeline()
            for key_name in keys_to_fetch:
                pipe.hget(key_name, TARGET_FIELD) # TARGET_FIELD from config
            results = pipe.execute()

            for i, key_name in enumerate(keys_to_fetch):
                content_value = results[i] # Already string due to decode_responses=True in r_text
                if content_value is not None:
                    output_data[key_name] = content_value
                else:
                    output_data[key_name] = f"<{TARGET_FIELD} field missing or null>"
                    logger.warning(f"Field '{TARGET_FIELD}' not found or is null for key '{key_name}' in brasov-cursuri slice.")
        
        return jsonify(output_data)
    except redis.RedisError as e: # Assuming redis is imported
        logger.error(f"Redis error in brasov-cursuri slice: {e}", exc_info=True)
        abort(500, description="Error communicating with data store for brasov-cursuri slice.")
    except ConnectionError as e: # Raised by get_redis_connection if pool not init
         logger.error(f"Redis connection error in brasov-cursuri slice: {e}", exc_info=True)
         abort(503, description="Service Unavailable: Cannot connect to backend data store.")
    except Exception as e:
        logger.error(f"An unexpected error occurred in brasov-cursuri slice request handler: {e}", exc_info=True)
        abort(500, description="An unexpected internal server error occurred.")

# Need to import redis for RedisError
import redis
