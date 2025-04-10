from flask import Flask, jsonify, abort, request, send_file, make_response
from flask_cors import CORS
import redis
import re # Import regular expressions for sorting
import json
import requests
import time
import base64
import io
from pathlib import Path

# --- Configuration ---
REDIS_HOST = "192.168.10.164"
REDIS_PORT = 6699
REDIS_DB = 0
REDIS_PASSWORD = None  # Set password if needed, otherwise None
KEY_PATTERN = "doc:brasov-cursuri:*"
TARGET_FIELD = "content"
FLASK_PORT = 5020 # Port for the web server

# Vector DB configuration
VECTOR_UPSERT_API_URL = "https://flow.sprk.ro/api/v1/vector/upsert/9ffc4511-5216-4454-b256-10c59ddeeddc"
VECTOR_SEARCH_API_URL = "https://flow.sprk.ro/api/v1/vector/search/9ffc4511-5216-4454-b256-10c59ddeeddc"
# --- End Configuration ---

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Global variable for Redis connection (can be improved with connection pooling for production)
redis_client = None

# API URL for name generation
NAME_GENERATOR_API_URL = "https://flow.sprk.ro/api/v1/prediction/6b1424e8-987a-4ede-97fe-05d953faf3e6"

def get_redis_connection():
    """Establishes and returns a Redis connection."""
    global redis_client
    if redis_client is None:
        try:
            print(f"Attempting to connect to Redis at {REDIS_HOST}:{REDIS_PORT} DB {REDIS_DB}...")
            r = redis.Redis(
                host=REDIS_HOST,
                port=REDIS_PORT,
                db=REDIS_DB,
                password=REDIS_PASSWORD,
                decode_responses=True
            )
            r.ping()
            print("Successfully connected to Redis.")
            redis_client = r
        except redis.exceptions.ConnectionError as e:
            print(f"FATAL: Could not connect to Redis: {e}")
            # In a real app, you might retry or have more robust handling
            raise ConnectionError(f"Failed to connect to Redis: {e}")
        except redis.exceptions.AuthenticationError:
             print(f"FATAL: Redis authentication failed. Check password.")
             raise ConnectionError("Redis authentication failed.")
        except Exception as e:
            print(f"FATAL: An unexpected error occurred during Redis connection: {e}")
            raise ConnectionError(f"Unexpected Redis connection error: {e}")
    return redis_client

def get_binary_redis_connection():
    try:
        # Create Redis client
        r = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            db=REDIS_DB,
            password=REDIS_PASSWORD,
            decode_responses=False,
            socket_connect_timeout=5 # Add a timeout
        )
        r.ping()
        print("Successfully connected to Redis")
        return r
    except redis.exceptions.ConnectionError as e:
        print(f"Error connecting to Redis: {str(e)}")
        # Return a connection anyway, to allow the app to start
        redis_client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            db=REDIS_DB,
            password=REDIS_PASSWORD,
            decode_responses=False
        )
        return redis_client

def extract_numeric_index(key_name):
    """Extracts the numeric index from the key name (e.g., 'doc:brasov-cursuri:10' -> 10)."""
    match = re.search(r':(\d+)$', key_name)
    if match:
        return int(match.group(1))
    return -1 # Return -1 or raise error if format is unexpected

@app.route('/brasov-cursuri/<start_str>/<stop_str>', methods=['GET'])
def get_brasov_cursuri_slice(start_str, stop_str):
    """API endpoint to get a slice of documents."""
    try:
        start = int(start_str)
        # Stop is exclusive in Python slicing, user probably means inclusive index
        # So if they ask for 1/5, they mean indices 1, 2, 3, 4. Slice needed is [1:5]
        stop = int(stop_str)

        if start < 0 or stop < start:
            # Use Flask's abort to return a standard HTTP error response
            abort(400, description="Invalid range: 'start' must be non-negative and 'stop' must be >= 'start'.")

    except ValueError:
        abort(400, description="Invalid input: 'start' and 'stop' must be integers.")

    try:
        r = get_redis_connection()

        # --- Fetch and Sort Keys ---
        print(f"Scanning for keys matching pattern: {KEY_PATTERN}")
        all_keys = []
        try:
            # Use scan_iter for efficiency
            key_iterator = r.scan_iter(match=KEY_PATTERN)
            # Store keys with their numeric index for proper sorting
            keys_with_indices = []
            for key in key_iterator:
                index = extract_numeric_index(key)
                if index != -1:
                    keys_with_indices.append((index, key))
                else:
                    print(f"Warning: Could not parse index from key '{key}'. Skipping.")

            # Sort keys based on the extracted numeric index
            keys_with_indices.sort(key=lambda item: item[0])
            # Get the sorted list of key names
            sorted_keys = [item[1] for item in keys_with_indices]
            print(f"Found and sorted {len(sorted_keys)} keys.")

        except redis.RedisError as e:
            print(f"Redis error during key scan: {e}")
            abort(500, description="Error retrieving keys from Redis.") # Internal Server Error
        except Exception as e:
             print(f"Unexpected error during key processing: {e}")
             abort(500, description="An internal error occurred while processing keys.")

        # --- Apply Slicing ---
        # Python slice is [start:stop] (exclusive of stop)
        # User request 1/5 -> indices 1, 2, 3, 4 -> slice [1:5]
        # User request 10/15 -> indices 10, 11, 12, 13, 14 -> slice [10:15]
        keys_to_fetch = sorted_keys[start:stop]
        print(f"Fetching content for keys from index {start} up to (but not including) {stop}.")

        # --- Fetch Content ---
        output_data = {}
        if not keys_to_fetch:
            print("No keys fall within the requested range after sorting.")
        else:
             try:
                # Using a pipeline can be slightly more efficient for multiple HGETs
                pipe = r.pipeline()
                for key_name in keys_to_fetch:
                    pipe.hget(key_name, TARGET_FIELD)
                # Execute the pipeline and get results
                results = pipe.execute()

                # Populate output dictionary
                for i, key_name in enumerate(keys_to_fetch):
                    content_value = results[i]
                    if content_value is not None:
                        output_data[key_name] = content_value
                    else:
                        # Decide how to handle missing content field: skip, null, or note
                        output_data[key_name] = f"<{TARGET_FIELD} field missing or null>"
                        print(f"Warning: Field '{TARGET_FIELD}' not found or is null for key '{key_name}'.")

             except redis.RedisError as e:
                 print(f"Redis error during HGET pipeline: {e}")
                 abort(500, description="Error fetching content from Redis.")
             except Exception as e:
                  print(f"Unexpected error during content fetch: {e}")
                  abort(500, description="An internal error occurred while fetching content.")

        # Return the result as JSON
        return jsonify(output_data)

    except ConnectionError as e:
         # Handle the Redis connection error raised by get_redis_connection
         print(f"Error detail: {e}")
         abort(503, description="Service Unavailable: Cannot connect to backend data store.") # Service Unavailable
    except Exception as e:
        # Catch-all for other unexpected errors
        print(f"An unexpected error occurred in the request handler: {e}")
        abort(500, description="An unexpected internal server error occurred.")

# Optional: Add custom error handlers to ensure JSON responses for errors
@app.errorhandler(400)
def bad_request(e):
    return jsonify(error=str(e.description)), 400

@app.errorhandler(500)
def internal_server_error(e):
    return jsonify(error=str(e.description)), 500

@app.errorhandler(503)
def service_unavailable(e):
    return jsonify(error=str(e.description)), 503

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
            headers={"Content-Type": "application/json"}
        )

        # Print response for debugging
        print(f"AI API Response for name generation: {response.text}")

        # Parse response
        result = response.json()

        # Extract the name from the response - check both 'text' and 'output' fields
        if 'text' in result:
            return result['text'].strip()
        elif 'output' in result:
            return result['output'].strip()
        else:
            print(f"Error: AI response missing both 'text' and 'output' fields: {result}")
            return None
    except Exception as e:
        print(f"Error generating document name: {e}")
        return None

@app.route('/api/materials', methods=['GET'])
def get_materials():
    try:
        # Get Redis connection (non-decoded)
        redis_client = get_binary_redis_connection()

        # Get all document keys from Redis
        all_keys = redis_client.keys(b'doc:brasov-cursuri:*')

        # Filter out any non-document keys
        doc_keys = [key for key in all_keys if not key.endswith(b':name')]

        documents = []

        for key in doc_keys:
            try:
                # Get the document hash
                doc_hash = redis_client.hgetall(key)

                # Skip if empty
                if not doc_hash:
                    continue

                # Create the document object with decoded text fields
                document = {
                    'id': key.decode('utf-8'),
                    'content': doc_hash.get(b'content', b'').decode('utf-8', errors='replace'),
                    'name': doc_hash.get(b'name', b'').decode('utf-8', errors='replace'),
                    'has_pdf': b'pdf_data' in doc_hash
                }

                # Don't include the pdf_data in the response

                documents.append(document)
            except Exception as e:
                print(f"Error processing key {key}: {str(e)}")

        return jsonify({
            'success': True,
            'documents': documents
        })

    except Exception as e:
        print(f"Error in get_materials: {str(e)}")
        return jsonify({'error': str(e)}), 500

def find_redis_entry_by_content(content, max_attempts=5, delay=1):
    """Find a Redis entry that contains the exact content provided"""
    redis_client = get_redis_connection()

    # Try multiple times with delay in between
    for attempt in range(max_attempts):
        print(f"Searching for entry with matching content (attempt {attempt+1}/{max_attempts})")

        # Get all document keys
        all_keys = [key.decode('utf-8') for key in redis_client.keys(KEY_PATTERN)]

        # Check each key for matching content
        for key in all_keys:
            try:
                content_bytes = redis_client.hget(key, 'content')
                if content_bytes:
                    try:
                        current_content = content_bytes.decode('utf-8')
                        if current_content == content:
                            print(f"Found matching content in key: {key}")
                            return key
                    except UnicodeDecodeError:
                        print(f"Warning: Could not decode content field for key {key} - skipping")
            except Exception as e:
                print(f"Error checking key {key}: {e}")
                continue

        # If no match found, wait before retrying
        print(f"No matching content found, waiting {delay} seconds before retrying...")
        time.sleep(delay)

    print("Failed to find matching content after all attempts")
    return None

@app.route('/api/materials/upload', methods=['POST'])
def upload_material():
    try:
        data = request.json
        text = data.get('text', '')

        if not text:
            return jsonify({'error': 'No text provided'}), 400

        # ONLY do the Flowise upsert - don't touch Redis directly
        vector_result = store_document_in_vector_db(text)
        print(f"Document stored in vector DB with result: {vector_result}")

        return jsonify({
            'success': True
        })
    except Exception as e:
        print(f"Error in upload_material: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/materials/sync-unnamed', methods=['POST'])
def sync_unnamed_documents():
    try:
        # Get Redis connection
        redis_client = get_binary_redis_connection()

        # Get all document keys from Redis
        all_keys = redis_client.keys(b'doc:brasov-cursuri:*')

        # Filter out any non-document keys
        doc_keys = [key for key in all_keys if not key.endswith(b':name')]

        results = {
            'total': len(doc_keys),
            'processed': 0,
            'named': 0,
            'errors': 0,
            'named_documents': []
        }

        for key in doc_keys:
            try:
                print(f"Processing document {key}")

                # Check if this document already has a name
                has_name = redis_client.hexists(key, b'name')
                if has_name:
                    # Skip documents that already have names
                    continue

                # Get the document content
                content_bytes = redis_client.hget(key, b'content')
                if not content_bytes:
                    print(f"Document {key} has no content field")
                    results['errors'] += 1
                    continue

                try:
                    content = content_bytes.decode('utf-8')
                except UnicodeDecodeError:
                    print(f"Could not decode content for {key}")
                    results['errors'] += 1
                    continue

                # Generate a name for the document
                document_name = generate_document_name(content)

                if document_name:
                    # Store the name in Redis
                    redis_client.hset(key, b'name', document_name.encode('utf-8'))

                    # Add to results
                    results['named'] += 1
                    results['named_documents'].append({
                        'key': key.decode('utf-8'),
                        'name': document_name
                    })

                    print(f"Set name '{document_name}' for document {key}")
                else:
                    results['errors'] += 1

                results['processed'] += 1

            except Exception as e:
                print(f"Error processing document {key}: {str(e)}")
                results['errors'] += 1

        return jsonify({
            'success': True,
            'results': results
        })
    except Exception as e:
        print(f"Error in sync_unnamed_documents: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/materials/sync-name', methods=['POST'])
def sync_document_name():
    try:
        data = request.json
        key = data.get('key', '')

        if not key:
            return jsonify({'error': 'No key provided'}), 400

        # Get Redis connection (binary)
        redis_client = get_binary_redis_connection()

        # Check if the document exists
        key_bytes = key.encode('utf-8')
        if not redis_client.exists(key_bytes):
            return jsonify({'error': 'Document not found'}), 404

        # Get the document content from Redis
        content_bytes = redis_client.hget(key_bytes, b'content')
        if not content_bytes:
            return jsonify({'error': 'Document has no content'}), 404

        try:
            content = content_bytes.decode('utf-8', errors='replace')
        except Exception as e:
            print(f"Error decoding content: {e}")
            return jsonify({'error': 'Could not decode document content'}), 500

        # Generate a new name using AI
        document_name = generate_document_name(content)

        # Store the new name directly in the document hash
        if document_name:
            redis_client.hset(key_bytes, b'name', document_name.encode('utf-8'))
            print(f"Successfully set name '{document_name}' for key '{key}'")

            return jsonify({
                'success': True,
                'name': document_name
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to generate name'
            }), 500
    except Exception as e:
        print(f"Error in sync_document_name: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/materials/delete', methods=['POST'])
def delete_material():
    try:
        data = request.json
        key = data.get('key', '')

        if not key:
            return jsonify({'error': 'No key provided'}), 400

        # Get Redis connection (binary)
        redis_client = get_binary_redis_connection()

        # Check if document exists
        key_bytes = key.encode('utf-8')
        if not redis_client.exists(key_bytes):
            return jsonify({'error': 'Document not found'}), 404

        # Delete the document hash (contains all fields including name)
        redis_client.delete(key_bytes)

        return jsonify({
            'success': True,
            'message': 'Document deleted successfully'
        })
    except Exception as e:
        print(f"Error in delete_material: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/materials/sync-all', methods=['POST'])
def sync_all_documents():
    try:
        # Get Redis connection with binary data
        redis_client = get_binary_redis_connection()

        # Get all document keys from Redis as binary
        all_keys = redis_client.keys(b'doc:brasov-cursuri:*')
        print(f"Found {len(all_keys)} total keys in Redis")

        # Filter out any non-document keys
        doc_keys = [key for key in all_keys if not key.endswith(b':name')]
        print(f"Found {len(doc_keys)} document keys after filtering")

        results = {
            'total': len(doc_keys),
            'processed': 0,
            'already_named': 0,
            'named': 0,
            'deleted': 0,
            'errors': 0,
            'deleted_keys': [],
            'named_keys': []
        }

        # Debug counters
        debug_process_count = 0
        debug_api_call_count = 0
        debug_api_success_count = 0

        for key in doc_keys:
            try:
                debug_process_count += 1
                key_str = key.decode('utf-8')
                print(f"Processing document {debug_process_count}/{len(doc_keys)}: {key_str}")

                # Check if this document already has a name field
                has_name = redis_client.hexists(key, b'name')
                if has_name:
                    name_bytes = redis_client.hget(key, b'name')
                    if name_bytes:
                        existing_name = name_bytes.decode('utf-8', errors='replace')
                        print(f"Document already has name: {existing_name}")
                        results['already_named'] += 1
                        continue

                # Get the document content
                content_bytes = redis_client.hget(key, b'content')
                if not content_bytes:
                    print(f"Document {key_str} has no content field")
                    results['errors'] += 1
                    continue

                # Try to decode content
                try:
                    text = content_bytes.decode('utf-8', errors='replace')
                except Exception as e:
                    print(f"Error decoding content for {key_str}: {e}")
                    results['errors'] += 1
                    continue

                # Debug content
                print(f"Document content (first 100 chars): {text[:100]}...")

                # Check if content is just "#" or extremely short - delete this document
                if text == '#' or len(text) < 5:
                    print(f"Deleting document with short/invalid content: {key_str}")
                    # Store key details before deletion
                    results['deleted_keys'].append({
                        'key': key_str,
                        'content': text[:30] + ('...' if len(text) > 30 else '')
                    })

                    # Delete the document
                    redis_client.delete(key)
                    results['deleted'] += 1
                    continue

                # Get first 40 words of content for name generation
                first_40_words = ' '.join(text.split()[:40])

                # Create prompt for name generation - make it simple, asking for a 3-word summary
                prompt = f"Summarize this text in exactly 3 words: {first_40_words}"

                print(f"Calling AI API with prompt: {prompt[:100]}...")
                debug_api_call_count += 1

                # Call the AI API with the correct format
                try:
                    response = requests.post(
                        NAME_GENERATOR_API_URL,
                        json={"question": prompt},
                        headers={"Content-Type": "application/json"},
                        timeout=10  # Add timeout
                    )

                    # Print the actual response for debugging
                    print(f"AI API Response status: {response.status_code}")
                    print(f"AI API Response text: {response.text}")

                    # Parse the response
                    result = response.json()

                    # Check if the response has 'text' or 'output' field
                    if 'text' in result:
                        document_name = result['text'].strip()
                        debug_api_success_count += 1

                        print(f"Generated name: '{document_name}'")

                        # Store the name directly in the document hash
                        redis_client.hset(key, b'name', document_name.encode('utf-8'))

                        print(f"Successfully set name '{document_name}' for key '{key_str}'")

                        # Store detailed info about the named document
                        results['named_keys'].append({
                            'key': key_str,
                            'name': document_name,
                            'preview': first_40_words[:50] + ('...' if len(first_40_words) > 50 else '')
                        })

                        results['named'] += 1
                    elif 'output' in result:
                        document_name = result['output'].strip()
                        debug_api_success_count += 1

                        print(f"Generated name: '{document_name}'")

                        # Store the name directly in the document hash
                        redis_client.hset(key, b'name', document_name.encode('utf-8'))

                        print(f"Successfully set name '{document_name}' for key '{key_str}'")

                        # Store detailed info about the named document
                        results['named_keys'].append({
                            'key': key_str,
                            'name': document_name,
                            'preview': first_40_words[:50] + ('...' if len(first_40_words) > 50 else '')
                        })

                        results['named'] += 1
                    else:
                        print(f"Error: AI API response missing both 'text' and 'output' fields: {result}")
                        results['errors'] += 1
                except Exception as e:
                    print(f"Error with AI name generation: {e}")
                    results['errors'] += 1

                results['processed'] += 1

            except Exception as e:
                print(f"Error processing key {key}: {str(e)}")
                results['errors'] += 1

        # Calculate summary statistics
        results['summary'] = f"Named {results['named']} documents, deleted {results['deleted']} documents, {results['already_named']} already had names"

        # Add debug information
        print(f"Debug summary: processed {debug_process_count} docs, made {debug_api_call_count} API calls, got {debug_api_success_count} successful names")

        return jsonify({
            'success': True,
            'results': results
        })

    except Exception as e:
        print(f"Error in sync_all_documents: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/materials/pdf/<key>', methods=['GET'])
def get_pdf(key):
    try:
        # Validate key format
        if not key.startswith('doc:brasov-cursuri:'):
            return jsonify({'error': 'Invalid document key format'}), 400

        # Get Redis connection for binary data
        redis_client = get_binary_redis_connection()
        key_bytes = key.encode('utf-8')

        # Check if the document exists
        if not redis_client.exists(key_bytes):
            return jsonify({'error': 'Document not found'}), 404

        # Check if the document has PDF data
        if not redis_client.hexists(key_bytes, b'pdf_data'):
            return jsonify({'error': 'Document has no PDF data'}), 404

        # Get the PDF data directly as binary
        pdf_data = redis_client.hget(key_bytes, b'pdf_data')

        # Get document name if available
        doc_name = ""
        name_bytes = redis_client.hget(key_bytes, b'name')
        if name_bytes:
            try:
                doc_name = name_bytes.decode('utf-8', errors='replace')
            except:
                doc_name = key.split(':')[-1]

        if not doc_name:
            doc_name = key.split(':')[-1]

        # Create a BytesIO object with the PDF data
        pdf_io = io.BytesIO(pdf_data)
        pdf_io.seek(0)

        # Send the file
        return send_file(
            pdf_io,
            mimetype='application/pdf',
            as_attachment=False,
            download_name=f"{doc_name}.pdf"
        )
    except Exception as e:
        print(f"Error in get_pdf: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/materials/<doc_id>/pdf', methods=['GET'])
def get_document_pdf(doc_id):
    try:
        # Get Redis connection (binary mode)
        redis_client = get_binary_redis_connection()

        # Ensure the doc_id is correctly formatted
        if not doc_id.startswith('doc:brasov-cursuri:'):
            doc_id = f'doc:brasov-cursuri:{doc_id}'

        # Convert to bytes
        doc_id_bytes = doc_id.encode('utf-8')

        # Check if the document exists
        if not redis_client.exists(doc_id_bytes):
            return jsonify({'error': 'Document not found'}), 404

        # Get the PDF data directly
        pdf_data = redis_client.hget(doc_id_bytes, b'pdf_data')

        if not pdf_data:
            return jsonify({'error': 'No PDF data for this document'}), 404

        # Return the PDF data as a binary response
        response = make_response(pdf_data)
        response.headers.set('Content-Type', 'application/pdf')
        response.headers.set('Content-Disposition', f'inline; filename="{doc_id}.pdf"')

        return response

    except Exception as e:
        print(f"Error in get_document_pdf: {str(e)}")
        return jsonify({'error': str(e)}), 500

# New endpoint to search documents by content
@app.route('/api/materials/search', methods=['POST'])
def search_materials():
    try:
        data = request.json
        query = data.get('query', '')
        limit = int(data.get('limit', 10))

        if not query:
            return jsonify({'error': 'No search query provided'}), 400

        # Search vector database for semantically similar documents
        search_results = search_vector_db(query, limit)

        if not search_results or 'matches' not in search_results:
            return jsonify({'materials': [], 'count': 0})

        # Get Redis connection
        redis_client = get_redis_connection()

        # Get details for each matching document
        materials = []
        for match in search_results.get('matches', []):
            # Extract the document key from metadata
            doc_key = match.get('metadata', {}).get('key')
            if not doc_key:
                continue

            # Get document details from Redis
            doc_fields = redis_client.hgetall(doc_key)
            if not doc_fields or 'content' not in doc_fields:
                continue

            # Parse metadata
            metadata = {}
            if 'metadata' in doc_fields:
                try:
                    metadata = json.loads(doc_fields['metadata'])
                except json.JSONDecodeError:
                    metadata = {}

            # Create material data
            material_data = {
                'text': doc_fields['content'],
                'title': metadata.get('title', ''),
                'timestamp': int(doc_key.split(':')[-1]),
                'key': doc_key,
                'name': doc_fields.get('name', ''),
                'has_pdf': metadata.get('has_pdf', False),
                'score': match.get('score', 0)
            }

            materials.append(material_data)

        return jsonify({
            'materials': materials,
            'count': len(materials)
        })
    except Exception as e:
        print(f"Error in search_materials: {str(e)}")
        return jsonify({'error': str(e)}), 500

def store_document_in_vector_db(text, key=None):
    """Store document text in vector database for semantic search using Flowise API"""
    try:
        payload = {
            "overrideConfig": {
                "text": text,
            }
        }

        # Add metadata if key is provided
        if key:
            payload["overrideConfig"]["metadata"] = {"key": key}

        # Call Flowise API to store the document
        response = requests.post(VECTOR_UPSERT_API_URL, json=payload)
        result = response.json()
        print(f"Vector DB upsert response: {result}")
        return result
    except Exception as e:
        print(f"Error storing document in vector DB: {e}")
        return None

def search_vector_db(query_text, limit=10):
    """Search vector database for semantically similar documents"""
    try:
        payload = {
            "overrideConfig": {
                "query": query_text,
                "limit": limit
            }
        }

        response = requests.post(VECTOR_SEARCH_API_URL, json=payload)
        result = response.json()
        print(f"Vector DB search response: {result}")
        return result
    except Exception as e:
        print(f"Error searching vector DB: {e}")
        return None

@app.route('/api/materials/upload-pdf', methods=['POST'])
def upload_pdf_material():
    try:
        # Check if the request has the file part
        if 'pdf_file' not in request.files:
            return jsonify({'error': 'No PDF file provided'}), 400

        pdf_file = request.files['pdf_file']
        text = request.form.get('text', '')

        if not pdf_file:
            return jsonify({'error': 'No PDF file selected'}), 400

        if not text:
            return jsonify({'error': 'No text provided'}), 400

        # ONLY do the Flowise upsert - don't touch Redis directly
        vector_result = store_document_in_vector_db(text)
        print(f"Document stored in vector DB with result: {vector_result}")

        return jsonify({
            'success': True
        })
    except Exception as e:
        print(f"Error in upload_pdf_material: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/materials/sync-names', methods=['POST'])
def sync_document_names():
    try:
        # Get Redis connection with binary data
        redis_client = get_binary_redis_connection()

        # Get all document keys from Redis as binary
        all_keys = redis_client.keys(b'doc:brasov-cursuri:*')
        print(f"Found {len(all_keys)} total keys in Redis")

        # Filter out any non-document keys
        doc_keys = [key for key in all_keys if not key.endswith(b':name')]
        print(f"Found {len(doc_keys)} document keys after filtering")

        results = {
            'total': len(doc_keys),
            'processed': 0,
            'already_named': 0,
            'named': 0,
            'errors': 0,
            'named_documents': []
        }

        for key in doc_keys:
            try:
                key_str = key.decode('utf-8')
                print(f"Processing document: {key_str}")

                # Check if this document already has a name field
                has_name = redis_client.hexists(key, b'name')
                if has_name:
                    name_bytes = redis_client.hget(key, b'name')
                    if name_bytes:
                        existing_name = name_bytes.decode('utf-8', errors='replace')
                        print(f"Document already has name: {existing_name}")
                        results['already_named'] += 1
                        continue

                # Get the document content
                content_bytes = redis_client.hget(key, b'content')
                if not content_bytes:
                    print(f"Document has no content field")
                    results['errors'] += 1
                    continue

                # Try to decode content
                try:
                    text = content_bytes.decode('utf-8', errors='replace')
                except Exception as e:
                    print(f"Error decoding content: {e}")
                    results['errors'] += 1
                    continue

                # Generate document name using AI
                document_name = generate_document_name(text)

                if document_name:
                    # Store the name directly in the document hash
                    redis_client.hset(key, b'name', document_name.encode('utf-8'))

                    print(f"Set name '{document_name}' for key '{key_str}'")

                    # Store named document info
                    results['named_documents'].append({
                        'key': key_str,
                        'name': document_name
                    })

                    results['named'] += 1
                else:
                    print(f"Failed to generate name for document")
                    results['errors'] += 1

                results['processed'] += 1

            except Exception as e:
                print(f"Error processing key {key}: {str(e)}")
                results['errors'] += 1

        return jsonify({
            'success': True,
            'results': results
        })

    except Exception as e:
        print(f"Error in sync_document_names: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/quizzes/generate', methods=['POST'])
def generate_quiz():
    try:
        data = request.get_json()
        topic = data.get('topic')

        if not topic:
            return jsonify({'success': False, 'error': 'Topic is required'}), 400

        # Call the external API
        response = requests.post(
            'https://flow.sprk.ro/api/v1/prediction/5d18b69b-b911-4a27-b2dc-2105fd9b42ef',
            json={'question': topic},
            headers={'Content-Type': 'application/json'}
        )

        if response.status_code != 200:
            return jsonify({'success': False, 'error': f'External API error: {response.text}'}), 500

        # Parse the XML from the response
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
                        elif isinstance(message, str) and '<test>' in message:
                            xml_content = message
                            break

        if not xml_content:
            return jsonify({'success': False, 'error': 'No XML content found in response'}), 500

        # Parse the XML to JSON for easier rendering
        try:
            parsed_quiz = parse_quiz_xml(xml_content)
            return jsonify({
                'success': True,
                'quizXml': xml_content,
                'parsedQuiz': parsed_quiz
            })
        except Exception as e:
            return jsonify({'success': False, 'error': f'XML parsing error: {str(e)}'}), 500

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

def parse_quiz_xml(xml_string):
    # Clean the XML string by removing any non-XML content
    xml_pattern = re.compile(r'<test>.*?</test>', re.DOTALL)
    match = xml_pattern.search(xml_string)
    if match:
        xml_string = match.group(0)

    # Parse the XML
    root = ET.fromstring(xml_string)

    # Extract topic
    topic = root.find('topic').text if root.find('topic') is not None else ''

    # Extract questions
    questions = []
    for q in root.findall('.//question'):
        question_data = {
            'id': q.get('id', ''),
            'type': q.get('type', ''),
            'text': q.find('text').text if q.find('text') is not None else '',
            'options': []
        }

        # Extract options
        for option in q.findall('.//option'):
            is_correct = option.get('correct', 'false').lower() == 'true'
            option_text = option.text if option.text is not None else ''
            question_data['options'].append({
                'text': option_text,
                'correct': is_correct
            })

        questions.append(question_data)

    return {
        'topic': topic,
        'questions': questions
    }

@app.route('/api/quizzes/save', methods=['POST'])
def save_quiz():
    try:
        data = request.get_json()
        xml_content = data.get('xml')
        topic = data.get('topic')

        if not xml_content or not topic:
            return jsonify({'success': False, 'error': 'XML content and topic are required'}), 400

        # Get Redis client for binary data
        redis_client = get_binary_redis_connection()

        # Get all existing test keys to determine the next index
        existing_keys = redis_client.keys(b'doc:brasov-tests:*')

        # Extract indexes and find the highest one
        highest_index = 0
        for key in existing_keys:
            try:
                key_parts = key.decode('utf-8').split(':')
                if len(key_parts) == 3:
                    index = int(key_parts[2])
                    if index > highest_index:
                        highest_index = index
            except (ValueError, IndexError, UnicodeDecodeError):
                continue

        # Increment for new index
        new_index = highest_index + 1

        # Create new key
        new_key = f'doc:brasov-tests:{new_index}'

        # Save to Redis
        redis_client.hset(
            new_key.encode('utf-8'),
            mapping={
                b'xml': xml_content.encode('utf-8'),
                b'topic': topic.encode('utf-8'),
                b'timestamp': str(int(time.time())).encode('utf-8')
            }
        )

        return jsonify({
            'success': True,
            'key': new_key,
            'index': new_index
        })

    except Exception as e:
        print(f"Error saving quiz: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/quizzes', methods=['GET'])
def get_quizzes():
    try:
        # Get Redis client
        redis_client = get_binary_redis_connection()

        # Get all quiz keys
        quiz_keys = redis_client.keys(b'doc:brasov-tests:*')

        quizzes = []

        for key in quiz_keys:
            try:
                # Get quiz data
                quiz_data = redis_client.hgetall(key)

                # Skip if empty
                if not quiz_data:
                    continue

                # Parse quiz
                quiz = {
                    'key': key.decode('utf-8'),
                    'topic': quiz_data.get(b'topic', b'Unnamed Quiz').decode('utf-8', errors='replace'),
                    'timestamp': int(quiz_data.get(b'timestamp', b'0').decode('utf-8', errors='replace')),
                    'xml': quiz_data.get(b'xml', b'').decode('utf-8', errors='replace')
                }

                quizzes.append(quiz)
            except Exception as e:
                print(f"Error processing quiz key {key}: {str(e)}")

        # Sort quizzes by timestamp (newest first)
        quizzes.sort(key=lambda x: x['timestamp'], reverse=True)

        return jsonify({
            'success': True,
            'quizzes': quizzes
        })

    except Exception as e:
        print(f"Error fetching quizzes: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/assignments/save', methods=['POST'])
def save_assignment():
    try:
        data = request.get_json()
        xml_content = data.get('xml')
        topic = data.get('topic')

        if not xml_content or not topic:
            return jsonify({'success': False, 'error': 'XML content and topic are required'}), 400

        # Get Redis client for binary data
        redis_client = get_binary_redis_connection()

        # Get all existing assignment keys to determine the next index
        existing_keys = redis_client.keys(b'brasov-assignments:*')

        # Extract indexes and find the highest one
        highest_index = 0
        for key in existing_keys:
            try:
                key_parts = key.decode('utf-8').split(':')
                if len(key_parts) == 2:
                    index = int(key_parts[1])
                    if index > highest_index:
                        highest_index = index
            except (ValueError, IndexError, UnicodeDecodeError):
                continue

        # Increment for new index
        new_index = highest_index + 1

        # Create new key
        new_key = f'brasov-assignments:{new_index}'

        # Save to Redis
        redis_client.hset(
            new_key.encode('utf-8'),
            mapping={
                b'xml': xml_content.encode('utf-8'),
                b'topic': topic.encode('utf-8'),
                b'timestamp': str(int(time.time())).encode('utf-8')
            }
        )

        return jsonify({
            'success': True,
            'key': new_key,
            'index': new_index
        })

    except Exception as e:
        print(f"Error saving assignment: {str(e)}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/assignments', methods=['GET', 'OPTIONS'])
def get_assignments():
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = jsonify({'success': True})
        return add_cors_headers(response)

    try:
        print("Fetching assignments...")
        # Get Redis client
        redis_client = get_binary_redis_connection()

        # Get all assignment keys
        assignment_keys = redis_client.keys(b'brasov-assignments:*')
        print(f"Found {len(assignment_keys)} assignment keys")

        assignments = []

        for key in assignment_keys:
            try:
                # Get assignment data
                assignment_data = redis_client.hgetall(key)

                # Skip if empty
                if not assignment_data:
                    print(f"Skipping empty assignment: {key}")
                    continue

                # Parse assignment
                assignment = {
                    'key': key.decode('utf-8'),
                    'topic': assignment_data.get(b'topic', b'Unnamed Assignment').decode('utf-8', errors='replace'),
                    'timestamp': int(assignment_data.get(b'timestamp', b'0').decode('utf-8', errors='replace')),
                    'xml': assignment_data.get(b'xml', b'').decode('utf-8', errors='replace')
                }

                print(f"Found assignment: {assignment['key']}, topic: {assignment['topic']}")
                assignments.append(assignment)
            except Exception as e:
                print(f"Error processing assignment key {key}: {str(e)}")

        # Sort assignments by timestamp (newest first)
        assignments.sort(key=lambda x: x['timestamp'], reverse=True)

        response = jsonify({
            'success': True,
            'assignments': assignments
        })
        return add_cors_headers(response)

    except Exception as e:
        print(f"Error fetching assignments: {str(e)}")
        response = jsonify({'success': False, 'error': str(e)})
        return add_cors_headers(response), 500

# Add assignment delete route
@app.route('/api/assignments/delete', methods=['POST', 'OPTIONS'])
def delete_assignment():
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = jsonify({'success': True})
        return add_cors_headers(response)

    try:
        # Print request details for debugging
        print(f"Delete assignment request received: {request.data}")

        data = request.json
        if not data:
            print("Error: No JSON data provided in request")
            response = jsonify({'success': False, 'error': 'No JSON data provided'})
            return add_cors_headers(response), 400

        print(f"Request data: {data}")
        key = data.get('key', '')

        if not key:
            print("Error: No key provided in request")
            response = jsonify({'success': False, 'error': 'No key provided'})
            return add_cors_headers(response), 400

        # Get Redis connection (binary)
        redis_client = get_binary_redis_connection()

        # Handle both string format and ensure proper encoding
        if isinstance(key, str):
            # If key doesn't have the prefix, add it
            if not key.startswith('brasov-assignments:'):
                original_key = key
                key = f'brasov-assignments:{key}'
                print(f"Modified key from {original_key} to {key}")
            key_bytes = key.encode('utf-8')
        else:
            key_bytes = key

        # Add debug output
        print(f"Looking for assignment with key: {key} (bytes: {key_bytes})")

        # List all keys for debugging
        all_keys = redis_client.keys(b'brasov-assignments:*')
        print(f"Available assignment keys: {[k.decode('utf-8') for k in all_keys]}")

        # Check if assignment exists
        if not redis_client.exists(key_bytes):
            print(f"Error: Assignment not found with key: {key}")
            response = jsonify({'success': False, 'error': f'Assignment not found: {key}'})
            return add_cors_headers(response), 404

        # Delete the assignment hash
        result = redis_client.delete(key_bytes)
        print(f"Delete result: {result}")

        response = jsonify({
            'success': True,
            'message': 'Assignment deleted successfully'
        })
        return add_cors_headers(response)
    except Exception as e:
        print(f"Error in delete_assignment: {str(e)}")
        response = jsonify({'success': False, 'error': str(e)})
        return add_cors_headers(response), 500

# Add quiz delete route
@app.route('/api/quizzes/delete', methods=['POST', 'OPTIONS'])
def delete_quiz():
    # Handle preflight OPTIONS request
    if request.method == 'OPTIONS':
        response = jsonify({'success': True})
        return add_cors_headers(response)

    try:
        # Print request details for debugging
        print(f"Delete quiz request received: {request.data}")

        data = request.json
        if not data:
            print("Error: No JSON data provided in request")
            response = jsonify({'success': False, 'error': 'No JSON data provided'})
            return add_cors_headers(response), 400

        print(f"Request data: {data}")
        key = data.get('key', '')

        if not key:
            print("Error: No key provided in request")
            response = jsonify({'success': False, 'error': 'No key provided'})
            return add_cors_headers(response), 400

        # Get Redis connection (binary)
        redis_client = get_binary_redis_connection()

        # Handle both string format and ensure proper encoding
        if isinstance(key, str):
            # If key doesn't have the prefix, add it
            if not key.startswith('brasov-quizzes:'):
                original_key = key
                key = f'brasov-quizzes:{key}'
                print(f"Modified key from {original_key} to {key}")
            key_bytes = key.encode('utf-8')
        else:
            key_bytes = key

        # Add debug output
        print(f"Looking for quiz with key: {key} (bytes: {key_bytes})")

        # List all keys for debugging
        all_keys = redis_client.keys(b'brasov-quizzes:*')
        print(f"Available quiz keys: {[k.decode('utf-8') for k in all_keys]}")

        # Check if quiz exists
        if not redis_client.exists(key_bytes):
            print(f"Error: Quiz not found with key: {key}")
            response = jsonify({'success': False, 'error': f'Quiz not found: {key}'})
            return add_cors_headers(response), 404

        # Delete the quiz hash
        result = redis_client.delete(key_bytes)
        print(f"Delete result: {result}")

        response = jsonify({
            'success': True,
            'message': 'Quiz deleted successfully'
        })
        return add_cors_headers(response)
    except Exception as e:
        print(f"Error in delete_quiz: {str(e)}")
        response = jsonify({'success': False, 'error': str(e)})
        return add_cors_headers(response), 500

# --- CORS and response handling ---
def add_cors_headers(response):
    """Add CORS headers to a response."""
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

if __name__ == '__main__':
    print(f"--- Starting Flask Web Server on http://0.0.0.0:{FLASK_PORT} ---")
    # Get the initial connection attempt out of the way before starting server
    try:
        get_redis_connection()
    except ConnectionError:
        print("--- Exiting due to failed initial Redis connection ---")
        exit(1) # Exit if we can't connect on startup

    # Run the Flask app
    # host='0.0.0.0' makes it accessible from other machines on your network
    # debug=True is helpful for development (auto-reloads, provides debugger)
    # Remove debug=True for production deployments
    app.run(host='0.0.0.0', port=FLASK_PORT, debug=True)
