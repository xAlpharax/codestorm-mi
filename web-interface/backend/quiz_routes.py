from flask import Blueprint, jsonify, request
import logging
import requests 
import time 
import re 
import xml.etree.ElementTree as ET 
from pydantic import ValidationError

from .redis_utils import get_binary_redis_connection
from .config import QUIZ_GENERATOR_API_URL, PREFIX_DOC_BRASOV_TESTS, PREFIX_BRASOV_QUIZZES_LEGACY_DELETE
from .models import (
    QuizGenerateRequest, QuizSaveRequest, QuizDeleteRequest, ErrorResponse,
    QuizGenerateResponse # For response model example
)

logger = logging.getLogger("EduAPI")
quiz_bp = Blueprint('quiz_bp', __name__)

# Helper function (originally in app.py, moved here)
def parse_quiz_xml(xml_string):
    try:
        # Clean the XML string by removing any non-XML content more robustly
        # Allow <quiz> or <test> as root
        xml_pattern = re.compile(r'(<(?:test|quiz)>.*?</(?:test|quiz)>)', re.DOTALL | re.IGNORECASE)
        match = xml_pattern.search(xml_string)
        if match:
            xml_string = match.group(0)
        else:
            logger.warning(f"Could not find <test> or <quiz> tags in XML string: {xml_string[:200]}...")
            # Attempt to parse anyway, or raise an error if strict parsing is needed.
            # For now, let ET.fromstring try and potentially fail.
            # raise ValueError("No <test> or <quiz> tag found in XML content")

        root = ET.fromstring(xml_string) 

        topic_element = root.find('topic')
        topic = topic_element.text.strip() if topic_element is not None and topic_element.text is not None else 'Untitled Quiz'
        
        questions = []
        for q_idx, q_element in enumerate(root.findall('.//question')): 
            question_id = q_element.get('id', f'q{q_idx+1}')
            question_type = q_element.get('type', 'unknown')
            text_element = q_element.find('text')
            question_text = text_element.text.strip() if text_element is not None and text_element.text is not None else 'No question text'

            question_data = {
                'id': question_id,
                'type': question_type,
                'text': question_text,
                'options': []
            }
            for opt_idx, option_element in enumerate(q_element.findall('.//option')):
                is_correct = option_element.get('correct', 'false').lower() == 'true'
                option_text = option_element.text.strip() if option_element.text is not None else f'Option {opt_idx+1}'
                question_data['options'].append({'text': option_text, 'correct': is_correct})
            questions.append(question_data)
        
        logger.info(f"Successfully parsed quiz XML. Topic: '{topic}', Questions: {len(questions)}")
        return {'topic': topic, 'questions': questions}
    except ET.ParseError as e: # Specific catch for clarity, will be re-raised
        logger.error(f"XML parsing error in parse_quiz_xml: {e}", exc_info=True)
        raise # Re-raise to be caught by the route's error handler
    except Exception as e:
        logger.error(f"Unexpected error in parse_quiz_xml: {e}", exc_info=True)
        raise # Re-raise


@quiz_bp.route('/generate', methods=['POST'])
def generate_quiz():
    """
    Generate a new quiz based on a given topic using an external AI service.

    Method: POST
    URL: /generate (relative to blueprint prefix /api/v1/quizzes)
    Request Body (JSON):
        Requires: QuizGenerateRequest Pydantic model
        {
            "topic": "The topic for the quiz." (string, required, min_length=1)
        }
    Success Response (200 OK):
        Content-Type: application/json
        Body: QuizGenerateResponse Pydantic model
        {
            "success": true,
            "quizXml": "<test><topic>...</topic>...</test>" (string, the generated quiz in XML format),
            "parsedQuiz": {
                "topic": "The topic for the quiz.",
                "questions": [
                    {
                        "id": "q1",
                        "type": "multiple_choice",
                        "text": "What is 2+2?",
                        "options": [
                            {"text": "3", "correct": false},
                            {"text": "4", "correct": true}
                        ]
                    }
                ]
            }
        }
    Error Responses:
        400 Bad Request:
            - If no JSON data is provided.
              {"success": false, "error": "No JSON data provided"}
            - If validation fails (e.g., 'topic' field is missing or empty).
              {"success": false, "error": "Validation failed", "details": [{"loc": ["topic"], ...}]}
        500 Internal Server Error:
            - If the external API response does not contain XML content.
              {"success": false, "error": "No XML content found in response"}
            - If there's an error parsing the generated XML.
              {"success": false, "error": "Generated quiz content was not valid XML: <error_details>"}
            - For other unexpected errors.
              {"success": false, "error": "An internal server error occurred"}
        502 Bad Gateway: If the external AI service for quiz generation fails or returns an error.
            {"success": false, "error": "External API error: Could not connect to quiz service."}
        504 Gateway Timeout: If the external AI service times out.
            {"success": false, "error": "Quiz generation timed out"}
    """
    try:
        json_data = request.get_json()
        if not json_data:
            return jsonify(ErrorResponse(error="No JSON data provided").model_dump()), 400

        validated_data = QuizGenerateRequest(**json_data)
        topic = validated_data.topic
        logger.info(f"Generating quiz for topic: {topic}")

        response = requests.post(
            QUIZ_GENERATOR_API_URL,
            json={'question': topic}, # Pydantic model ensures topic is a string
            headers={'Content-Type': 'application/json'},
            timeout=30 
        )
        logger.debug(f"Quiz generation API response status: {response.status_code}")
        logger.debug(f"Quiz generation API response text (first 500 chars): {response.text[:500]}...")
        response.raise_for_status()

        response_data = response.json()
        xml_content = ''
        if isinstance(response_data, dict) and 'text' in response_data:
            xml_content = response_data['text']
        elif isinstance(response_data, list): 
            for item in response_data:
                if isinstance(item, dict) and item.get('agentName') == 'QuizGenerator' and item.get('messages'):
                    for message in item['messages']:
                        if isinstance(message, dict) and 'text' in message:
                            xml_content = message['text']
                            break
                        elif isinstance(message, str) and ('<test>' in message or '<quiz>' in message): 
                            xml_content = message
                            break
                if xml_content: break

        if not xml_content:
            logger.error(f"No XML content found in quiz generation response for topic '{topic}'. Response: {response_data}")
            return jsonify({'success': False, 'error': 'No XML content found in response'}), 500

        logger.info(f"Successfully generated XML quiz content for topic: {topic}")
        parsed_quiz = parse_quiz_xml(xml_content)
        # Using Pydantic response model example
        response_model = QuizGenerateResponse(quizXml=xml_content, parsedQuiz=parsed_quiz)
        return jsonify(response_model.model_dump(exclude_none=True))
    except ValidationError as e:
        logger.warning(f"Validation error in generate_quiz: {e.errors()}", exc_info=True)
        return jsonify(ErrorResponse(error="Validation failed", details=e.errors()).model_dump()), 400
    except requests.exceptions.Timeout:
        logger.error(f"Timeout generating quiz for topic: {request.json.get('topic', 'N/A')}", exc_info=True)
        return jsonify(ErrorResponse(error='Quiz generation timed out').model_dump()), 504 
    except requests.exceptions.RequestException as e:
        logger.error(f"External API error during quiz generation for topic {request.json.get('topic', 'N/A')}: {e}", exc_info=True)
        return jsonify(ErrorResponse(error='External API error: Could not connect to quiz service.').model_dump()), 502 
    except ET.ParseError as e: 
        logger.error(f"XML parsing error for generated quiz on topic {request.json.get('topic', 'N/A')}: {e}", exc_info=True)
        return jsonify(ErrorResponse(error=f'Generated quiz content was not valid XML: {str(e)}').model_dump()), 500
    except Exception as e:
        logger.error(f"Error generating quiz for topic {request.json.get('topic', 'N/A')}: {str(e)}", exc_info=True)
        return jsonify(ErrorResponse(error='An internal server error occurred').model_dump()), 500

@quiz_bp.route('/save', methods=['POST'])
def save_quiz():
    """
    Save a generated quiz (in XML format) to Redis.

    Method: POST
    URL: /save (relative to blueprint prefix /api/v1/quizzes)
    Request Body (JSON):
        Requires: QuizSaveRequest Pydantic model
        {
            "xml": "<test>...</test>" (string, required, min_length=1, the quiz content in XML),
            "topic": "Quiz Topic" (string, required, min_length=1)
        }
    Success Response (200 OK):
        Content-Type: application/json
        Body:
        {
            "success": true,
            "key": "doc:brasov-tests:123" (string, the Redis key under which the quiz was saved),
            "index": 123 (integer, the new index/ID for the quiz)
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
            {"success": false, "error": "Error saving quiz to data store"}
    """
    try:
        json_data = request.get_json()
        if not json_data:
            return jsonify(ErrorResponse(error="No JSON data provided").model_dump()), 400
        
        validated_data = QuizSaveRequest(**json_data)
        xml_content = validated_data.xml
        topic = validated_data.topic

        r_binary = get_binary_redis_connection()
        existing_keys = r_binary.keys(PREFIX_DOC_BRASOV_TESTS)
        logger.debug(f"Found {len(existing_keys)} existing quiz keys for index calculation.")
        highest_index = 0
        for key_bytes in existing_keys:
            try:
                key_str = key_bytes.decode('utf-8')
                key_parts = key_str.split(':') 
                if len(key_parts) == 3: # Expecting doc:brasov-tests:INDEX
                    index = int(key_parts[2])
                    if index > highest_index: highest_index = index
            except (ValueError, IndexError, UnicodeDecodeError) as e:
                logger.warning(f"Could not parse index from quiz key '{key_bytes.decode('utf-8', errors='replace')}': {e}")
                continue
        
        new_index = highest_index + 1
        new_key = f'doc:brasov-tests:{new_index}' # Standardized prefix
        logger.info(f"Saving new quiz with key: {new_key}, topic: {topic}")
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
        logger.warning(f"Validation error in save_quiz: {e.errors()}", exc_info=True)
        return jsonify(ErrorResponse(error="Validation failed", details=e.errors()).model_dump()), 400
    except redis.RedisError as e:
        logger.error(f"Redis error saving quiz (topic: {request.json.get('topic', 'N/A')}): {str(e)}", exc_info=True)
        return jsonify(ErrorResponse(error='Error saving quiz to data store').model_dump()), 500
    except Exception as e:
        logger.error(f"Error saving quiz (topic: {request.json.get('topic', 'N/A')}): {str(e)}", exc_info=True)
        return jsonify(ErrorResponse(error='An internal server error occurred').model_dump()), 500

@quiz_bp.route('/', methods=['GET'])
def get_quizzes():
    """
    Retrieve a list of all saved quizzes.

    Method: GET
    URL: / (relative to blueprint prefix /api/v1/quizzes)
    Parameters: None
    Success Response (200 OK):
        Content-Type: application/json
        Body:
        {
            "success": true,
            "quizzes": [
                {
                    "key": "doc:brasov-tests:1",
                    "topic": "Math Basics",
                    "timestamp": 1678886400,
                    "xml": "<test>...</test>"
                },
                // ... more quizzes, sorted by timestamp descending
            ]
        }
        (Structure might ideally map to a QuizListResponse Pydantic model)
    Error Responses:
        503 Service Unavailable: If connection to Redis fails.
            {"success": false, "error": "Could not connect to data store"}
        500 Internal Server Error: For other unexpected errors.
            {"success": false, "error": "An internal server error occurred"}
    """
    try:
        logger.info("Fetching all quizzes.")
        r_binary = get_binary_redis_connection()
        quiz_keys = r_binary.keys(PREFIX_DOC_BRASOV_TESTS) # Standardized prefix
        logger.info(f"Found {len(quiz_keys)} quiz keys with prefix '{PREFIX_DOC_BRASOV_TESTS}'.")
        quizzes = []
        for key_bytes in quiz_keys:
            key_str = key_bytes.decode('utf-8', errors='replace')
            try:
                quiz_data = r_binary.hgetall(key_bytes)
                if not quiz_data:
                    logger.warning(f"Skipping empty quiz data for key: {key_str}")
                    continue
                quiz = {
                    'key': key_str,
                    'topic': quiz_data.get(b'topic', b'Unnamed Quiz').decode('utf-8', errors='replace'),
                    'timestamp': int(quiz_data.get(b'timestamp', b'0').decode('utf-8', errors='replace')),
                    'xml': quiz_data.get(b'xml', b'').decode('utf-8', errors='replace')
                }
                quizzes.append(quiz)
            except redis.RedisError as e:
                logger.error(f"Redis error processing quiz key {key_str}: {str(e)}", exc_info=True)
            except (ValueError, UnicodeDecodeError) as e: 
                logger.error(f"Data error processing quiz key {key_str}: {str(e)}", exc_info=True)
            except Exception as e:
                logger.error(f"Unexpected error processing quiz key {key_str}: {str(e)}", exc_info=True)
        
        quizzes.sort(key=lambda x: x['timestamp'], reverse=True)
        logger.info(f"Returning {len(quizzes)} quizzes.")
        return jsonify({'success': True, 'quizzes': quizzes})
    except redis.RedisError as e:
        logger.error(f"Redis connection error fetching quizzes: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': 'Could not connect to data store'}), 503
    except Exception as e:
        logger.error(f"Error fetching quizzes: {str(e)}", exc_info=True)
        return jsonify({'success': False, 'error': 'An internal server error occurred'}), 500

@quiz_bp.route('/delete', methods=['POST', 'OPTIONS']) # Added OPTIONS for preflight
def delete_quiz():
    """
    Delete a specific quiz from Redis using its key.

    Method: POST
    URL: /delete (relative to blueprint prefix /api/v1/quizzes)
    Request Body (JSON):
        Requires: QuizDeleteRequest Pydantic model
        {
            "key": "doc:brasov-tests:some_id" (string, required, min_length=1, the Redis key of the quiz)
        }
    Success Response (200 OK):
        Content-Type: application/json
        Body:
        {
            "success": true,
            "message": "Quiz deleted successfully"
        }
    Error Responses:
        400 Bad Request:
            - If no JSON data is provided.
              {"success": false, "error": "No JSON data provided"}
            - If validation fails (e.g., 'key' field is missing or empty).
              {"success": false, "error": "Validation failed", "details": [{"loc": ["key"], ...}]}
        404 Not Found: If the quiz key does not exist in Redis.
            {"success": false, "error": "Quiz not found: <key_param>"}
        500 Internal Server Error: For unexpected errors.
            {"success": false, "error": "An internal server error occurred"}
        503 Service Unavailable: If connection to Redis fails.
            {"success": false, "error": "Error deleting quiz from data store"}
    """
    if request.method == 'OPTIONS':
        logger.debug("Handling OPTIONS request for /delete")
        # Response headers will be added by add_cors_headers in app.py or by Flask-CORS
        return jsonify({'success': True})

    try:
        logger.debug(f"Delete quiz request received. Data: {request.data}")
        json_data = request.get_json()
        if not json_data:
            return jsonify(ErrorResponse(error="No JSON data provided").model_dump()), 400

        validated_data = QuizDeleteRequest(**json_data)
        key_param = validated_data.key
        
        r_binary = get_binary_redis_connection()
        
        # Determine the correct key format. Quizzes are saved with 'doc:brasov-tests:INDEX'
        # The old delete logic used 'brasov-quizzes:', which might be a legacy pattern or an error.
        # For consistency, we should delete based on the format they are saved and listed.
        key_to_delete_str = key_param
        if not key_param.startswith('doc:brasov-tests:'):
            # If it's a simple index or a key from a different pattern, adjust it.
            # This part might need refinement if multiple valid key patterns for quizzes exist.
            # For now, assume if it's not the standard prefix, it might be just an index.
            if ':' not in key_param: # e.g. "123"
                 key_to_delete_str = f'doc:brasov-tests:{key_param}'
            # Else, if it has a different prefix like 'brasov-quizzes:', it won't match keys saved
            # with 'doc:brasov-tests:'. This could be intentional for old data or an issue.
            # For now, we prioritize deleting keys that match the save format.
            # If keys like 'brasov-quizzes:123' also need deletion, that's a separate concern.
            logger.info(f"Delete quiz: Attempting to normalize key from '{key_param}' to '{key_to_delete_str}' if it's an index.")
        
        key_bytes = key_to_delete_str.encode('utf-8')
        logger.info(f"Attempting to delete quiz with key: {key_to_delete_str} (bytes: {key_bytes})")

        # Check if key exists before deleting
        if not r_binary.exists(key_bytes):
            # As a fallback, check the legacy pattern if the primary one isn't found
            # This makes the delete more robust if there's mixed data.
            legacy_key_str = f"{PREFIX_BRASOV_QUIZZES_LEGACY_DELETE}{key_param.split(':')[-1]}"
            legacy_key_bytes = legacy_key_str.encode('utf-8')
            if r_binary.exists(legacy_key_bytes):
                logger.info(f"Quiz not found with '{key_to_delete_str}', but found with legacy key '{legacy_key_str}'. Deleting legacy key.")
                key_bytes = legacy_key_bytes
                key_to_delete_str = legacy_key_str
            else:
                logger.warning(f"Quiz not found for deletion with key: {key_to_delete_str} (and not with legacy pattern {legacy_key_str})")
                return jsonify({'success': False, 'error': f'Quiz not found: {key_param}'}), 404
        
        delete_count = r_binary.delete(key_bytes)
        logger.info(f"Delete result for quiz {key_to_delete_str}: {delete_count} (1 means success)")
        return jsonify({'success': True, 'message': 'Quiz deleted successfully'})
    except ValidationError as e:
        logger.warning(f"Validation error in delete_quiz: {e.errors()}", exc_info=True)
        return jsonify(ErrorResponse(error="Validation failed", details=e.errors()).model_dump()), 400
    except redis.RedisError as e:
        logger.error(f"Redis error deleting quiz (key: {request.json.get('key', 'N/A')}): {str(e)}", exc_info=True)
        return jsonify(ErrorResponse(error='Error deleting quiz from data store').model_dump()), 500
    except Exception as e:
        logger.error(f"Error in delete_quiz (key: {request.json.get('key', 'N/A')}): {str(e)}", exc_info=True)
        return jsonify(ErrorResponse(error='An internal server error occurred').model_dump()), 500
