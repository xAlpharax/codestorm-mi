from flask import Blueprint, jsonify, request
import logging
import time 
from pydantic import ValidationError

from .redis_utils import get_binary_redis_connection
from .config import PREFIX_BRASOV_ASSIGNMENTS
from .models import AssignmentSaveRequest, AssignmentDeleteRequest, ErrorResponse 
# Potentially AssignmentItem, AssignmentListResponse for response models

logger = logging.getLogger("EduAPI")
assignment_bp = Blueprint('assignment_bp', __name__)

@assignment_bp.route('/save', methods=['POST'])
def save_assignment():
    """
    Save a new assignment (in XML format) to Redis.

    Method: POST
    URL: /save (relative to blueprint prefix /api/v1/assignments)
    Request Body (JSON):
        Requires: AssignmentSaveRequest Pydantic model
        {
            "xml": "<assignment>...</assignment>" (string, required, min_length=1, the assignment content in XML),
            "topic": "Assignment Topic" (string, required, min_length=1)
        }
    Success Response (200 OK):
        Content-Type: application/json
        Body:
        {
            "success": true,
            "key": "brasov-assignments:123" (string, the Redis key under which the assignment was saved),
            "index": 123 (integer, the new index/ID for the assignment)
        }
    Error Responses:
        400 Bad Request:
            - If no JSON data is provided.
              {"success": false, "error": "No JSON data provided"}
            - If validation fails (e.g., 'xml' or 'topic' missing/empty).
              {"success": false, "error": "Validation failed", "details": [...]}
        500 Internal Server Error: For unexpected errors during saving.
            {"success": false, "error": "An internal server error occurred"}
        503 Service Unavailable: If connection to Redis fails.
            {"success": false, "error": "Error saving assignment to data store"}
    """
    try:
        json_data = request.get_json()
        if not json_data:
            return jsonify(ErrorResponse(error="No JSON data provided").model_dump()), 400
            
        validated_data = AssignmentSaveRequest(**json_data)
        xml_content = validated_data.xml
        topic = validated_data.topic
        
        r_binary = get_binary_redis_connection()
        existing_keys = r_binary.keys(PREFIX_BRASOV_ASSIGNMENTS)
        logger.debug(f"Found {len(existing_keys)} existing assignment keys for index calculation.")
        highest_index = 0
        for key_bytes in existing_keys:
            try:
                key_str = key_bytes.decode('utf-8')
                key_parts = key_str.split(':') 
                if len(key_parts) == 2: # Expecting brasov-assignments:INDEX
                    index = int(key_parts[1])
                    if index > highest_index: highest_index = index
            except (ValueError, IndexError, UnicodeDecodeError) as e:
                logger.warning(f"Could not parse index from assignment key '{key_bytes.decode('utf-8', errors='replace')}': {e}")
                continue
        
        new_index = highest_index + 1
        new_key = f'brasov-assignments:{new_index}' # Using the prefix from config
        logger.info(f"Saving new assignment with key: {new_key}, topic: {topic}")
        r_binary.hset(
            new_key.encode('utf-8'),
            mapping={
                b'xml': xml_content.encode('utf-8'),
                b'topic': topic.encode('utf-8'),
                b'timestamp': str(int(time.time())).encode('utf-8')
            }
        )
        return jsonify({'success': True, 'key': new_key, 'index': new_index})
    except ValidationError as e:
        logger.warning(f"Validation error in save_assignment: {e.errors()}", exc_info=True)
        return jsonify(ErrorResponse(error="Validation failed", details=e.errors()).model_dump()), 400
    except redis.RedisError as e: 
        logger.error(f"Redis error saving assignment (topic: {request.json.get('topic', 'N/A')}): {str(e)}", exc_info=True)
        return jsonify(ErrorResponse(error='Error saving assignment to data store').model_dump()), 500
    except Exception as e:
        logger.error(f"Error saving assignment (topic: {request.json.get('topic', 'N/A')}): {str(e)}", exc_info=True)
        return jsonify(ErrorResponse(error='An internal server error occurred').model_dump()), 500

@assignment_bp.route('/', methods=['GET', 'OPTIONS'])
def get_assignments():
    """
    Retrieve a list of all saved assignments.

    Method: GET (also handles OPTIONS for CORS preflight)
    URL: / (relative to blueprint prefix /api/v1/assignments)
    Parameters: None
    Success Response (200 OK for GET):
        Content-Type: application/json
        Body:
        {
            "success": true,
            "assignments": [
                {
                    "key": "brasov-assignments:1",
                    "topic": "Calculus Assignment",
                    "timestamp": 1678886400,
                    "xml": "<assignment>...</assignment>"
                },
                // ... more assignments, sorted by timestamp descending
            ]
        }
        (Structure might ideally map to an AssignmentListResponse Pydantic model)
    Success Response (200 OK for OPTIONS):
        Empty JSON body with CORS headers.
        {"success": true}
    Error Responses (for GET):
        503 Service Unavailable: If connection to Redis fails.
            {"success": false, "error": "Could not connect to data store"}
        500 Internal Server Error: For other unexpected errors.
            {"success": false, "error": "An internal server error occurred"}
    """
    if request.method == 'OPTIONS':
        logger.debug("Handling OPTIONS request for /")
        return jsonify({'success': True}) # CORS headers added by Flask-CORS or main app

    try:
        logger.info("Fetching all assignments.")
        r_binary = get_binary_redis_connection()
        assignment_keys = r_binary.keys(PREFIX_BRASOV_ASSIGNMENTS)
        logger.info(f"Found {len(assignment_keys)} assignment keys with prefix '{PREFIX_BRASOV_ASSIGNMENTS}'.")
        assignments = []
        for key_bytes in assignment_keys:
            key_str = key_bytes.decode('utf-8', errors='replace')
            try:
                assignment_data = r_binary.hgetall(key_bytes)
                if not assignment_data:
                    logger.warning(f"Skipping empty assignment data for key: {key_str}")
                    continue
                assignment = {
                    'key': key_str,
                    'topic': assignment_data.get(b'topic', b'Unnamed Assignment').decode('utf-8', errors='replace'),
                    'timestamp': int(assignment_data.get(b'timestamp', b'0').decode('utf-8', errors='replace')),
                    'xml': assignment_data.get(b'xml', b'').decode('utf-8', errors='replace')
                }
                logger.debug(f"Found assignment: {assignment['key']}, topic: {assignment['topic']}")
                assignments.append(assignment)
            except redis.RedisError as e: # Assuming redis is imported
                logger.error(f"Redis error processing assignment key {key_str}: {str(e)}", exc_info=True)
            except (ValueError, UnicodeDecodeError) as e:
                logger.error(f"Data error processing assignment key {key_str}: {str(e)}", exc_info=True)
            except Exception as e:
                logger.error(f"Unexpected error processing assignment key {key_str}: {str(e)}", exc_info=True)

        assignments.sort(key=lambda x: x['timestamp'], reverse=True)
        logger.info(f"Returning {len(assignments)} assignments.")
        return jsonify({'success': True, 'assignments': assignments})
    except redis.RedisError as e: # Assuming redis is imported
        logger.error(f"Redis connection error fetching assignments: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': 'Could not connect to data store'}), 503
    except Exception as e:
        logger.error(f"Error fetching assignments: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': 'An internal server error occurred'}), 500

@assignment_bp.route('/delete', methods=['POST', 'OPTIONS'])
def delete_assignment():
    """
    Delete a specific assignment from Redis using its key.

    Method: POST (also handles OPTIONS for CORS preflight)
    URL: /delete (relative to blueprint prefix /api/v1/assignments)
    Request Body (JSON):
        Requires: AssignmentDeleteRequest Pydantic model
        {
            "key": "brasov-assignments:some_id" (string, required, min_length=1, the Redis key of the assignment)
        }
    Success Response (200 OK for POST):
        Content-Type: application/json
        Body:
        {
            "success": true,
            "message": "Assignment deleted successfully"
        }
    Success Response (200 OK for OPTIONS):
        Empty JSON body with CORS headers.
        {"success": true}
    Error Responses (for POST):
        400 Bad Request:
            - If no JSON data is provided.
              {"success": false, "error": "No JSON data provided"}
            - If validation fails (e.g., 'key' field is missing or empty).
              {"success": false, "error": "Validation failed", "details": [{"loc": ["key"], ...}]}
        404 Not Found: If the assignment key does not exist in Redis.
            {"success": false, "error": "Assignment not found: <key_param>"}
        500 Internal Server Error: For unexpected errors.
            {"success": false, "error": "An internal server error occurred"}
        503 Service Unavailable: If connection to Redis fails.
            {"success": false, "error": "Error deleting assignment from data store"}
    """
    if request.method == 'OPTIONS':
        logger.debug("Handling OPTIONS request for /delete")
        return jsonify({'success': True}) # CORS headers added by Flask-CORS or main app

    try:
        logger.debug(f"Delete assignment request received. Data: {request.data}")
        json_data = request.get_json()
        if not json_data:
            return jsonify(ErrorResponse(error="No JSON data provided").model_dump()), 400

        validated_data = AssignmentDeleteRequest(**json_data)
        key_param = validated_data.key
        
        r_binary = get_binary_redis_connection()
        
        # Ensure key has the correct prefix if only an index is passed
        key_to_delete_str = key_param
        if not key_param.startswith('brasov-assignments:'):
            if ':' not in key_param: # If it's just an index like "123"
                 key_to_delete_str = f'brasov-assignments:{key_param}'
            logger.info(f"Delete assignment: Normalized key from '{key_param}' to '{key_to_delete_str}'.")
        
        key_bytes = key_to_delete_str.encode('utf-8')
        logger.info(f"Attempting to delete assignment with key: {key_to_delete_str} (bytes: {key_bytes})")

        if not r_binary.exists(key_bytes):
            logger.warning(f"Assignment not found for deletion with key: {key_to_delete_str}")
            return jsonify({'success': False, 'error': f'Assignment not found: {key_param}'}), 404

        delete_count = r_binary.delete(key_bytes)
        logger.info(f"Delete result for assignment {key_to_delete_str}: {delete_count} (1 means success)")
        return jsonify({'success': True, 'message': 'Assignment deleted successfully'})
    except ValidationError as e:
        logger.warning(f"Validation error in delete_assignment: {e.errors()}", exc_info=True)
        return jsonify(ErrorResponse(error="Validation failed", details=e.errors()).model_dump()), 400
    except redis.RedisError as e: 
        logger.error(f"Redis error deleting assignment (key: {request.json.get('key', 'N/A')}): {str(e)}", exc_info=True)
        return jsonify(ErrorResponse(error='Error deleting assignment from data store').model_dump()), 500
    except Exception as e:
        logger.error(f"Error in delete_assignment (key: {request.json.get('key', 'N/A')}): {str(e)}", exc_info=True)
        return jsonify(ErrorResponse(error='An internal server error occurred').model_dump()), 500

# Need to import redis for RedisError if it's explicitly caught by type.
# from .redis_utils already provides connections, so direct redis import might not be needed
# unless specific error types like redis.RedisError are being caught.
# import redis # Keep if redis.RedisError is used in except blocks
