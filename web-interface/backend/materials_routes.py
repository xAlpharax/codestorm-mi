from flask import Blueprint, jsonify, request, abort
import logging
import requests 
import time 
from pydantic import ValidationError

from .redis_utils import get_redis_connection, get_binary_redis_connection
from .vector_db_utils import store_document_in_vector_db, search_vector_db
from .models import (
    MaterialUploadRequest, MaterialSyncNameRequest, MaterialDeleteRequest,
    MaterialSearchRequest, MaterialUploadPDFRequest, SyncAllMaterialsRequest, 
    ErrorResponse,
    # MaterialListResponse, MaterialItem, MaterialSearchResponse, MaterialSearchResultItem # For response models
)
from .config import (
    KEY_PATTERN, TARGET_FIELD, NAME_GENERATOR_API_URL, # KEY_PATTERN and TARGET_FIELD used by legacy/find_redis_entry
    PREFIX_DOC_BRASOV_CURSURI, NAME_SUFFIX_FILTER
)

logger = logging.getLogger("EduAPI")
materials_bp = Blueprint('materials_bp', __name__)

# Helper function (originally in app.py, moved here as it's specific to materials)
def generate_document_name(content):
    """Generate a document name using the AI bot"""
    try:
        # Get first 40 words of content
        first_40_words = ' '.join(content.split()[:40])

        # Create a simple prompt for a 3-word summary
        prompt = f"Summarize this text in exactly 3 words: {first_40_words}"

        # Call the AI API with explicit headers
        response = requests.post(
            NAME_GENERATOR_API_URL,
            json={"question": prompt},
            headers={"Content-Type": "application/json"},
            timeout=10
        )

        logger.debug(f"AI API Response for name generation status: {response.status_code}")
        logger.debug(f"AI API Response for name generation text: {response.text}")
        response.raise_for_status() 

        result = response.json()
        if 'text' in result:
            return result['text'].strip()
        elif 'output' in result:
            return result['output'].strip()
        else:
            logger.error(f"AI response missing both 'text' and 'output' fields: {result}")
            return None
    except requests.exceptions.Timeout:
        logger.error(f"Timeout calling AI API for name generation: {prompt[:50]}...", exc_info=True)
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Error calling AI API for name generation: {e}", exc_info=True)
        return None
    except Exception as e:
        logger.error(f"Error generating document name: {e}", exc_info=True)
        return None

# Helper function (originally in app.py, moved here)
def find_redis_entry_by_content(content, max_attempts=5, delay=1):
    """Find a Redis entry that contains the exact content provided"""
    try:
        r_text = get_redis_connection()
        for attempt in range(max_attempts):
            logger.info(f"Searching for entry with matching content (attempt {attempt+1}/{max_attempts})")
            all_keys = [key for key in r_text.keys(KEY_PATTERN)] # Assuming KEY_PATTERN is for text content

            for key in all_keys:
                try:
                    content_bytes = r_text.hget(key, 'content') # hget for text client
                    if content_bytes: # content_bytes is already string due to decode_responses=True
                        if content_bytes == content:
                            logger.info(f"Found matching content in key: {key}")
                            return key
                except redis.RedisError as e:
                    logger.error(f"Redis error checking key {key}: {e}", exc_info=True)
                    continue 
                except Exception as e:
                    logger.error(f"Error checking key {key}: {e}", exc_info=True)
                    continue
            if attempt < max_attempts -1:
                logger.info(f"No matching content found, waiting {delay} seconds before retrying...")
                time.sleep(delay)
        logger.warning("Failed to find matching content after all attempts")
        return None
    except redis.RedisError as e:
        logger.error(f"Redis connection error in find_redis_entry_by_content: {e}", exc_info=True)
        return None
    except Exception as e:
        logger.error(f"Unexpected error in find_redis_entry_by_content: {e}", exc_info=True)
        return None

@materials_bp.route('/', methods=['GET'])
def get_materials():
    """
    Retrieve a list of all teaching materials.

    Method: GET
    URL: / (relative to blueprint prefix /api/v1/materials)
    Parameters: None
    Success Response (200 OK):
        Content-Type: application/json
        Body:
        {
            "success": true,
            "documents": [
                {
                    "id": "doc:brasov-cursuri:1",
                    "content": "Text content of the material...",
                    "name": "Introduction to Programming",
                    "has_pdf": true
                },
                // ... more documents
            ]
        }
        (Structure might ideally map to a MaterialListResponse Pydantic model)
    Error Responses:
        503 Service Unavailable: If connection to Redis fails.
            {"error": "Error connecting to data store"}
        500 Internal Server Error: For other unexpected errors.
            {"error": "An internal server error occurred"}
    """
    try:
        r_binary = get_binary_redis_connection()
        all_keys = r_binary.keys(PREFIX_DOC_BRASOV_CURSURI)
        doc_keys = [key for key in all_keys if not key.endswith(NAME_SUFFIX_FILTER)]
        logger.info(f"Found {len(doc_keys)} material keys.")
        documents = []
        for key in doc_keys:
            key_str = key.decode('utf-8', errors='replace')
            try:
                doc_hash = r_binary.hgetall(key)
                if not doc_hash:
                    logger.warning(f"Skipping empty hash for key: {key_str}")
                    continue
                document = {
                    'id': key_str,
                    'content': doc_hash.get(b'content', b'').decode('utf-8', errors='replace'),
                    'name': doc_hash.get(b'name', b'').decode('utf-8', errors='replace'),
                    'has_pdf': b'pdf_data' in doc_hash
                }
                documents.append(document)
            except Exception as e:
                logger.error(f"Error processing key {key_str} in get_materials: {str(e)}", exc_info=True)
        return jsonify({'success': True, 'documents': documents})
    except redis.RedisError as e:
        logger.error(f"Redis error in get_materials: {str(e)}", exc_info=True)
        return jsonify({'error': 'Error connecting to data store'}), 503
    except Exception as e:
        logger.error(f"Error in get_materials: {str(e)}", exc_info=True)
        return jsonify({'error': 'An internal server error occurred'}), 500

@materials_bp.route('/upload', methods=['POST'])
def upload_material():
    """
    Upload new material text to be stored in the vector database.

    Method: POST
    URL: /upload (relative to blueprint prefix /api/v1/materials)
    Request Body (JSON):
        Requires: MaterialUploadRequest Pydantic model
        {
            "text": "The textual content of the material." (string, required, min_length=1)
        }
    Success Response (200 OK):
        Content-Type: application/json
        Body:
        {
            "success": true
        }
    Error Responses:
        400 Bad Request:
            - If no JSON data is provided.
              {"success": false, "error": "No JSON data provided"}
            - If validation fails (e.g., 'text' field is missing or empty).
              {"success": false, "error": "Validation failed", "details": [{"loc": ["text"], ...}]}
        500 Internal Server Error: For unexpected errors during processing.
            {"success": false, "error": "Failed to upload material"}
    """
    try:
        json_data = request.get_json()
        if not json_data:
            return jsonify(ErrorResponse(error="No JSON data provided").model_dump()), 400
        
        validated_data = MaterialUploadRequest(**json_data)
        text = validated_data.text
        
        # For uploads, we typically don't have a key yet.
        # If we need to link this to a Redis entry later, the logic might need adjustment,
        # e.g., create Redis entry first, get key, then pass to vector DB.
        # Current logic: store in vector DB, then potentially find/create Redis entry based on content.
        vector_result = store_document_in_vector_db(text) # Key is not passed here
        logger.info(f"Document stored in vector DB with result: {vector_result}")

        # Optional: If you need to ensure it's in Redis too, you might call find_redis_entry_by_content
        # or have a separate mechanism to create a Redis entry if it's purely new content.
        # This endpoint seems to only handle the vector DB part.

        return jsonify({'success': True })
    except ValidationError as e:
        logger.warning(f"Validation error in upload_material: {e.errors()}", exc_info=True)
        return jsonify(ErrorResponse(error="Validation failed", details=e.errors()).model_dump()), 400
    except Exception as e:
        logger.error(f"Error in upload_material: {str(e)}", exc_info=True)
        return jsonify(ErrorResponse(error="Failed to upload material").model_dump()), 500

# Removed sync_unnamed_documents() and its route.
# Its functionality (naming unnamed documents) will be covered by sync_all_documents.

@materials_bp.route('/sync-name', methods=['POST'])
def sync_document_name():
    """
    Generate and update the name for a single, specific material document in Redis.
    This will always attempt to generate a new name, even if one already exists.

    Method: POST
    URL: /sync-name (relative to blueprint prefix /api/v1/materials)
    Request Body (JSON):
        Requires: MaterialSyncNameRequest Pydantic model
        {
            "key": "doc:brasov-cursuri:some_id" (string, required, min_length=1, the Redis key of the document)
        }
    Success Response (200 OK):
        Content-Type: application/json
        Body:
        {
            "success": true,
            "name": "Generated Document Name"
        }
    Error Responses:
        400 Bad Request:
            - If no JSON data is provided.
              {"success": false, "error": "No JSON data provided"}
            - If validation fails (e.g., 'key' field is missing or empty).
              {"success": false, "error": "Validation failed", "details": [{"loc": ["key"], ...}]}
        404 Not Found: If the document key does not exist or has no content.
            {"error": "Document not found"}
            {"error": "Document has no content"}
        500 Internal Server Error:
            - If there's an error decoding content.
              {"error": "Could not decode document content"}
            - If the AI name generation fails.
              {"success": false, "error": "Failed to generate name"}
            - For other unexpected errors.
              {"success": false, "error": "An internal server error occurred"}
        503 Service Unavailable: If connection to Redis fails.
            {"success": false, "error": "Error connecting to data store"}
    """
    try:
        json_data = request.get_json()
        if not json_data:
            return jsonify(ErrorResponse(error="No JSON data provided").model_dump()), 400
        
        validated_data = MaterialSyncNameRequest(**json_data)
        key = validated_data.key

        r_binary = get_binary_redis_connection()
        key_bytes = key.encode('utf-8')
        if not r_binary.exists(key_bytes):
            logger.warning(f"Document not found for sync-name: {key}")
            return jsonify({'error': 'Document not found'}), 404

        content_bytes = r_binary.hget(key_bytes, b'content')
        if not content_bytes:
            logger.warning(f"Document has no content for sync-name: {key}")
            return jsonify({'error': 'Document has no content'}), 404
        try:
            content = content_bytes.decode('utf-8', errors='replace')
        except Exception as e:
            logger.error(f"Error decoding content for key {key} in sync-name: {e}", exc_info=True)
            return jsonify({'error': 'Could not decode document content'}), 500

        document_name = generate_document_name(content)
        if document_name:
            r_binary.hset(key_bytes, b'name', document_name.encode('utf-8'))
            logger.info(f"Successfully set name '{document_name}' for key '{key}'")
            return jsonify({'success': True, 'name': document_name})
        else:
            logger.warning(f"Failed to generate name for key {key} in sync-name.")
            return jsonify(ErrorResponse(error='Failed to generate name').model_dump()), 500
    except ValidationError as e:
        logger.warning(f"Validation error in sync_document_name: {e.errors()}", exc_info=True)
        return jsonify(ErrorResponse(error="Validation failed", details=e.errors()).model_dump()), 400
    except redis.RedisError as e:
        logger.error(f"Redis error in sync_document_name for key {request.json.get('key', 'N/A')}: {str(e)}", exc_info=True)
        return jsonify(ErrorResponse(error='Error connecting to data store').model_dump()), 503
    except Exception as e:
        logger.error(f"Error in sync_document_name for key {request.json.get('key', 'N/A')}: {str(e)}", exc_info=True)
        return jsonify(ErrorResponse(error='An internal server error occurred').model_dump()), 500

@materials_bp.route('/delete', methods=['POST'])
def delete_material():
    """
    Delete a specific material document from Redis.
    Note: This currently only deletes from Redis, not necessarily from the vector DB.

    Method: POST
    URL: /delete (relative to blueprint prefix /api/v1/materials)
    Request Body (JSON):
        Requires: MaterialDeleteRequest Pydantic model
        {
            "key": "doc:brasov-cursuri:some_id" (string, required, min_length=1, the Redis key of the document)
        }
    Success Response (200 OK):
        Content-Type: application/json
        Body:
        {
            "success": true,
            "message": "Document deleted successfully"
        }
    Error Responses:
        400 Bad Request:
            - If no JSON data is provided.
              {"success": false, "error": "No JSON data provided"}
            - If validation fails (e.g., 'key' field is missing or empty).
              {"success": false, "error": "Validation failed", "details": [{"loc": ["key"], ...}]}
        404 Not Found: If the document key does not exist in Redis.
            {"error": "Document not found"}
        500 Internal Server Error: For unexpected errors during processing.
            {"success": false, "error": "An internal server error occurred"}
        503 Service Unavailable: If connection to Redis fails.
            {"success": false, "error": "Error connecting to data store"}
    """
    try:
        json_data = request.get_json()
        if not json_data:
            return jsonify(ErrorResponse(error="No JSON data provided").model_dump()), 400

        validated_data = MaterialDeleteRequest(**json_data)
        key = validated_data.key
        
        r_binary = get_binary_redis_connection()
        key_bytes = key.encode('utf-8')
        if not r_binary.exists(key_bytes): # Ensure key exists before attempting delete
            logger.warning(f"Document not found for deletion: {key}")
            return jsonify({'error': 'Document not found'}), 404
        
        # Potentially, also delete from vector DB if there's a link.
        # This requires knowing the vector DB ID or having a way to query it.
        # For now, only Redis deletion is implemented.
        # content_for_vector_deletion = r_binary.hget(key_bytes, b'content') # If needed

        r_binary.delete(key_bytes)
        logger.info(f"Document deleted successfully from Redis: {key}")
        
        # if content_for_vector_deletion:
        #    delete_from_vector_db_by_content_or_key(key) # This function would need to be created

        return jsonify({'success': True, 'message': 'Document deleted successfully'})
    except ValidationError as e:
        logger.warning(f"Validation error in delete_material: {e.errors()}", exc_info=True)
        return jsonify(ErrorResponse(error="Validation failed", details=e.errors()).model_dump()), 400
    except redis.RedisError as e:
        logger.error(f"Redis error in delete_material for key {request.json.get('key', 'N/A')}: {str(e)}", exc_info=True)
        return jsonify(ErrorResponse(error='Error connecting to data store').model_dump()), 503
    except Exception as e:
        logger.error(f"Error in delete_material for key {request.json.get('key', 'N/A')}: {str(e)}", exc_info=True)
        return jsonify(ErrorResponse(error='An internal server error occurred').model_dump()), 500

@materials_bp.route('/sync-all', methods=['POST'])
def sync_all_documents():
    """
    Synchronize all material documents. This includes:
    - Generating names for documents that don't have one.
    - Optionally forcing re-generation of names for all documents.
    - Deleting documents with very short or invalid content (e.g., "#" or < 5 chars).

    Method: POST
    URL: /sync-all (relative to blueprint prefix /api/v1/materials)
    Request Body (JSON):
        Optional: SyncAllMaterialsRequest Pydantic model
        {
            "force_rename": false (boolean, optional, default: false)
        }
    Success Response (200 OK):
        Content-Type: application/json
        Body: A results object detailing the actions taken, e.g.,
        {
            "success": true,
            "results": {
                "total_keys_scanned": 100,
                "processed_for_naming_or_rename": 50,
                "named": 20,
                "renamed": 5,
                "already_named_skipped": 45,
                "deleted_short": 5,
                "errors": 0,
                "named_documents_log": [{"key": "...", "name": "...", "action": "named/renamed", "preview": "..."}],
                "deleted_documents_log": [{"key": "...", "preview": "..."}],
                "summary": "Scanned 100 keys. Initially named: 20. Re-named: 5. ..."
            }
        }
    Error Responses:
        400 Bad Request: If validation for 'force_rename' fails (e.g., not a boolean).
            {"success": false, "error": "Validation failed for request parameters", "details": [...]}
        503 Service Unavailable: If connection to Redis fails.
            {"error": "Could not connect to data store"}
        500 Internal Server Error: For other unexpected errors.
            {"error": "An internal server error occurred"}
    """
    try:
        json_data = request.get_json(silent=True) # Allow empty body for default force_rename=False
        if json_data is None: # If body is empty or not JSON
            json_data = {} # Default to empty dict for Pydantic model

        validated_data = SyncAllMaterialsRequest(**json_data)
        force_rename = validated_data.force_rename
        
        logger.info(f"Starting sync_all_documents. Force rename: {force_rename}")

        r_binary = get_binary_redis_connection()
        all_keys = r_binary.keys(PREFIX_DOC_BRASOV_CURSURI)
        logger.info(f"Found {len(all_keys)} total keys matching pattern '{PREFIX_DOC_BRASOV_CURSURI}' for sync-all.")
        
        # If not forcing rename, we only care about keys that don't have a name or where name is empty.
        # If forcing rename, we process all keys.
        # For simplicity in loop, we fetch all and decide inside, but could filter `doc_keys` here.
        # For now, will iterate all_keys and check condition inside.
        doc_keys_to_process = all_keys # Process all keys, decision to name/rename is inside loop

        results = {
            'total_keys_scanned': len(all_keys),
            'processed_for_naming_or_rename': 0,
            'named': 0, 
            'renamed': 0,
            'already_named_skipped': 0,
            'deleted_short': 0, 
            'errors': 0, 
            'named_documents_log': [], # Log of named/renamed
            'deleted_documents_log': [] # Log of deleted
        }
        debug_api_call_count = 0
        # debug_api_success_count = 0 # This was used for generate_document_name success, now part of 'named' or 'renamed'

        for key in doc_keys_to_process:
            key_str = key.decode('utf-8', errors='replace')
            try:
                content_bytes = r_binary.hget(key, b'content')
                if not content_bytes:
                    logger.warning(f"Document {key_str} has no content field. Skipping.")
                    results['errors'] += 1
                    continue
                
                try:
                    text = content_bytes.decode('utf-8', errors='replace')
                except Exception as e:
                    logger.error(f"Error decoding content for {key_str}: {e}", exc_info=True)
                    results['errors'] += 1
                    continue
                
                # Short document deletion logic (remains the same)
                if text == '#' or len(text) < 5:
                    logger.info(f"Deleting document with short/invalid content: {key_str}")
                    results['deleted_documents_log'].append({'key': key_str, 'preview': text[:30]})
                    r_binary.delete(key)
                    results['deleted_short'] += 1
                    continue

                # Naming / Re-naming logic
                current_name_exists = r_binary.hexists(key, b'name')
                should_generate_name = False

                if force_rename:
                    should_generate_name = True
                    logger.info(f"Processing {key_str} for potential re-naming (force_rename=True).")
                elif not current_name_exists:
                    should_generate_name = True
                    logger.info(f"Processing {key_str} for initial naming (no name exists).")
                else:
                    results['already_named_skipped'] += 1
                    logger.debug(f"Skipping {key_str}, already named and force_rename=False.")
                
                if should_generate_name:
                    results['processed_for_naming_or_rename'] += 1
                    document_name = generate_document_name(text)
                    debug_api_call_count +=1 # Counts calls to generate_document_name

                    if document_name:
                        r_binary.hset(key, b'name', document_name.encode('utf-8'))
                        log_entry = {'key': key_str, 'name': document_name, 'preview': text.split()[:10]}
                        if current_name_exists and force_rename: # It was a rename
                            results['renamed'] += 1
                            logger.info(f"Successfully RE-NAMED document {key_str} to '{document_name}'")
                            log_entry['action'] = 'renamed'
                        else: # It was an initial naming
                            results['named'] += 1
                            logger.info(f"Successfully NAMED document {key_str} as '{document_name}'")
                            log_entry['action'] = 'named'
                        results['named_documents_log'].append(log_entry)
                    else:
                        logger.error(f"Failed to generate name for {key_str} during sync-all.")
                        results['errors'] += 1
            except redis.RedisError as e:
                logger.error(f"Redis error processing key {key_str} in sync-all: {str(e)}", exc_info=True)
                results['errors'] += 1
            except Exception as e:
                logger.error(f"Error processing key {key_str} in sync-all: {str(e)}", exc_info=True)
                results['errors'] += 1
        
        results['summary'] = f"Named {results['named']} documents, deleted {results['deleted_short']} short documents."
        logger.info(f"Sync-all complete. Summary: {results['summary']}")
        logger.debug(f"Debug summary for sync-all: API calls: {debug_api_call_count}, Successful names: {debug_api_success_count}")
        return jsonify({'success': True, 'results': results})
    except redis.RedisError as e:
        logger.error(f"Redis connection error in sync_all_documents: {str(e)}", exc_info=True)
        return jsonify({'error': 'Could not connect to data store'}), 503
    except Exception as e:
        logger.error(f"Error in sync_all_documents: {str(e)}", exc_info=True)
        return jsonify({'error': 'An internal server error occurred'}), 500

@materials_bp.route('/search', methods=['POST'])
def search_materials():
    """
    Search for materials based on a query string using the vector database.
    Retrieves details for matching documents from Redis.

    Method: POST
    URL: /search (relative to blueprint prefix /api/v1/materials)
    Request Body (JSON):
        Requires: MaterialSearchRequest Pydantic model
        {
            "query": "search terms for materials" (string, required, min_length=1),
            "limit": 10 (integer, optional, default: 10, gt:0, le:100)
        }
    Success Response (200 OK):
        Content-Type: application/json
        Body:
        {
            "materials": [
                {
                    "text": "Content of matching material...",
                    "title": "Material Title or Name",
                    "timestamp": 1678886400,
                    "key": "doc:brasov-cursuri:some_id",
                    "name": "Material Name",
                    "has_pdf": false,
                    "score": 0.85 (semantic similarity score from vector DB)
                },
                // ... more materials
            ],
            "count": 1 (number of materials returned)
        }
        (Structure might ideally map to a MaterialSearchResponse Pydantic model)
    Error Responses:
        400 Bad Request:
            - If no JSON data is provided.
              {"success": false, "error": "No JSON data provided"}
            - If validation fails (e.g., 'query' empty, 'limit' out of range).
              {"success": false, "error": "Validation failed", "details": [...]}
        503 Service Unavailable:
            - If connection to vector search service fails.
              {"success": false, "error": "Failed to connect to search service"}
            - If connection to Redis fails.
              {"success": false, "error": "Could not connect to data store"}
        500 Internal Server Error: For other unexpected errors.
            {"success": false, "error": "An internal server error occurred"}
    """
    try:
        json_data = request.get_json()
        if not json_data:
            return jsonify(ErrorResponse(error="No JSON data provided").model_dump()), 400
            
        validated_data = MaterialSearchRequest(**json_data)
        query = validated_data.query
        limit = validated_data.limit # Already int due to Pydantic model

        logger.info(f"Searching materials with query: '{query}', limit: {limit}")

        search_results = search_vector_db(query, limit)
        if not search_results or 'matches' not in search_results or not search_results['matches']:
            logger.info(f"No matches found in vector DB for query: '{query}'")
            return jsonify({'materials': [], 'count': 0}) # Consider a Pydantic response model here
        
        logger.info(f"Found {len(search_results['matches'])} potential matches in vector DB.")
        
        r_text = get_redis_connection() 
        materials = []
        for match in search_results.get('matches', []):
            doc_key = match.get('metadata', {}).get('key')
            if not doc_key:
                logger.warning(f"Search result match missing 'key' in metadata: {match}")
                continue
            try:
                # Assuming doc_key refers to a Redis hash where 'content' and 'name' are stored
                # This part might need adjustment if the 'key' in vector DB doesn't map directly
                # or if data is structured differently in Redis.
                doc_fields = r_text.hgetall(doc_key) # hgetall returns dict of strings
                if not doc_fields or 'content' not in doc_fields:
                    logger.warning(f"Document or content not found in Redis for key: {doc_key}")
                    continue

                # 'metadata' here refers to the vector DB match metadata, not Redis stored metadata
                # 'has_pdf' might need to be checked from Redis if stored there
                # For now, assuming 'key' in match.metadata is the Redis key.
                
                # Check for PDF data using binary client with the same key
                r_binary_check = get_binary_redis_connection()
                has_pdf_flag = r_binary_check.hexists(doc_key.encode('utf-8'), b'pdf_data')


                material_data = {
                    'text': doc_fields.get('content', ''), # Use .get for safety
                    'title': doc_fields.get('title', doc_fields.get('name', '')), # Prefer title, fallback to name
                    'timestamp': int(doc_key.split(':')[-1]) if ':' in doc_key else 0, # Safer split
                    'key': doc_key,
                    'name': doc_fields.get('name', ''),
                    'has_pdf': has_pdf_flag,
                    'score': match.get('score', 0)
                }
                materials.append(material_data)
            except redis.RedisError as e:
                logger.error(f"Redis error fetching details for doc_key {doc_key} in search: {e}", exc_info=True)
            except Exception as e: 
                logger.error(f"Error processing search result for doc_key {doc_key}: {e}", exc_info=True)
        
        logger.info(f"Returning {len(materials)} materials for query: '{query}'")
        # Example for response model:
        # return MaterialSearchResponse(materials=materials, count=len(materials)).model_dump(exclude_none=True)
        return jsonify({'materials': materials, 'count': len(materials)})
    except ValidationError as e:
        logger.warning(f"Validation error in search_materials: {e.errors()}", exc_info=True)
        return jsonify(ErrorResponse(error="Validation failed", details=e.errors()).model_dump()), 400
    except requests.exceptions.RequestException as e: 
        logger.error(f"Vector DB search API request error: {e}", exc_info=True)
        return jsonify(ErrorResponse(error='Failed to connect to search service').model_dump()), 503
    except redis.RedisError as e: 
        logger.error(f"Redis connection error in search_materials: {e}", exc_info=True)
        return jsonify(ErrorResponse(error='Could not connect to data store').model_dump()), 503
    except Exception as e:
        logger.error(f"Error in search_materials: {str(e)}", exc_info=True)
        return jsonify(ErrorResponse(error='An internal server error occurred').model_dump()), 500

@materials_bp.route('/upload-pdf', methods=['POST'])
def upload_pdf_material():
    """
    Uploads the textual content associated with a PDF (or extracted from it)
    to the vector database. This endpoint primarily handles the text; actual
    PDF file binary storage in Redis is a separate step not fully implemented here.

    Method: POST
    URL: /upload-pdf (relative to blueprint prefix /api/v1/materials)
    Request Body:
        - Can be form-data containing a 'text' field.
        - Can be JSON containing a 'text' field (less common for file uploads but supported).
        - A 'pdf_file' part in form-data is expected if actual PDF processing were implemented.
        Pydantic Model (for text validation): MaterialUploadPDFRequest
        {
            "text": "Textual content related to the PDF." (string, required if no PDF file to extract from)
        }
    Success Response (200 OK):
        Content-Type: application/json
        Body:
        {
            "success": true,
            "message": "Text content from PDF context stored in vector DB." 
                       // or "PDF file received, processing not fully implemented..."
        }
    Error Responses:
        400 Bad Request:
            - If no text or PDF file is provided.
              {"success": false, "error": "No text or PDF file provided"}
            - If text validation fails (e.g., empty text when provided).
              {"success": false, "error": "Validation failed for text content", "details": [...]}
        500 Internal Server Error: For unexpected errors.
            {"success": false, "error": "Failed to upload PDF material text content"}
    """
    # This route primarily validates the 'text' from form data if provided for vector DB.
    # The actual PDF file handling (if stored) is separate.
    try:
        # 'pdf_file' part is in request.files, not request.json
        # Pydantic model MaterialUploadPDFRequest is for request.form part if text comes from there.
        # If text comes from JSON body along with other metadata (e.g. filename), then use request.json
        
        text_content = request.form.get('text') # Assuming text might come from form-data
        
        if not text_content: # If not in form, try json (though unusual for file uploads)
            json_data = request.get_json(silent=True) # silent=True if JSON body is optional
            if json_data:
                 validated_data = MaterialUploadPDFRequest(**json_data)
                 text_content = validated_data.text
            else: # No text from form or JSON
                # Check if text is required even if a file is present
                if 'pdf_file' not in request.files: # No file and no text
                     logger.warning("Upload PDF material: No text or PDF file provided.")
                     return jsonify(ErrorResponse(error="No text or PDF file provided").model_dump()), 400
                # If file is present, text might be optional or extracted later
                logger.info("Upload PDF material: PDF file present, no separate text field provided.")
                text_content = None # Mark as none, to be extracted from PDF later if needed

        if text_content: # If text was provided (either form or JSON)
            validated_text_data = MaterialUploadPDFRequest(text=text_content) # Validate the text part
            text_to_store = validated_text_data.text
            logger.info(f"Uploading PDF material (text content provided), text preview: {text_to_store[:100]}...")
            vector_result = store_document_in_vector_db(text_to_store)
            logger.info(f"PDF Document's text stored in vector DB with result: {vector_result}")
            message = "Text content from PDF context stored in vector DB."
        elif 'pdf_file' in request.files:
             # Placeholder: Here you would process request.files['pdf_file']
             # For example, extract text from it, then store in vector_db
             # And store the binary in Redis (e.g. r_binary.hset(key, b'pdf_data', file_bytes))
             logger.info("Upload PDF material: PDF file received. Text extraction/storage from PDF not yet implemented.")
             message = "PDF file received, processing not fully implemented for text extraction from PDF."
             # For now, if only file is present, don't store anything in vector DB unless text is extracted
        else:
            # This case should ideally be caught by earlier checks.
            logger.error("Upload PDF material: Inconsistent state, no text and no file after checks.")
            return jsonify(ErrorResponse(error="Internal error processing request").model_dump()), 500


        # To make this a true PDF upload that also stores the PDF binary:
        # 1. Get key for Redis (e.g., generate new one, or from request)
        # 2. if 'pdf_file' in request.files:
        #      pdf_file = request.files['pdf_file']
        #      pdf_binary_data = pdf_file.read()
        #      r_binary.hset(key_bytes, b'pdf_data', pdf_binary_data)
        # 3. If text_to_store is available (from form/JSON or extracted from PDF):
        #      store_document_in_vector_db(text_to_store, key=key_str_for_vector_db)

        return jsonify({'success': True, 'message': message})
    except ValidationError as e:
        logger.warning(f"Validation error in upload_pdf_material: {e.errors()}", exc_info=True)
        return jsonify(ErrorResponse(error="Validation failed for text content", details=e.errors()).model_dump()), 400
    except Exception as e:
        logger.error(f"Error in upload_pdf_material: {str(e)}", exc_info=True)
        return jsonify(ErrorResponse(error='Failed to upload PDF material text content').model_dump()), 500
# Removed sync_document_names() and its route as it's redundant with sync_unnamed_documents (which will also be refactored/removed)
