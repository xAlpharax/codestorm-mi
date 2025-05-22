from flask import Blueprint, jsonify, send_file, make_response
import logging
import io # For BytesIO

from .redis_utils import get_binary_redis_connection
# No direct config needed here other than what Redis utils use

logger = logging.getLogger("EduAPI")
pdf_bp = Blueprint('pdf_bp', __name__)

@pdf_bp.route('/by-key/<path:key>', methods=['GET']) # Use path converter for keys with colons
def get_pdf_by_full_key(key: str): 
    """
    Retrieve a PDF document by its full Redis key.

    Method: GET
    URL: /by-key/<path:key> (relative to blueprint prefix /api/v1/pdfs)
         The <path:key> converter allows keys containing slashes or colons.
    Parameters:
        - Path:
            - `key` (string, required): The full Redis key of the document
              (e.g., "doc:brasov-cursuri:123").
    Success Response (200 OK):
        Content-Type: application/pdf
        Body: The binary PDF data. The 'download_name' will be set to
              "{document_name_from_redis_or_key_suffix}.pdf".
    Error Responses:
        400 Bad Request: If the key format is deemed invalid by initial checks (currently one is commented out).
            {"error": "Invalid document key format"}
        404 Not Found:
            - If the document key does not exist in Redis.
              {"error": "Document not found"}
            - If the document exists but has no 'pdf_data' field.
              {"error": "Document has no PDF data"}
            - If the 'pdf_data' field exists but is empty.
              {"error": "PDF data is empty"}
        503 Service Unavailable: If connection to Redis fails.
            {"error": "Error connecting to data store"}
        500 Internal Server Error: For other unexpected errors.
            {"error": "An internal server error occurred"}
    """
    try:
        # Key validation might still be useful depending on expected format.
        # Example: if not key.startswith('doc:brasov-cursuri:'):
        #     logger.warning(f"Invalid document key format for PDF retrieval: {key}")
        #     return jsonify({'error': 'Invalid document key format'}), 400
        logger.info(f"PDF request by full key: {key}")
            return jsonify({'error': 'Invalid document key format'}), 400

        r_binary = get_binary_redis_connection()
        key_bytes = key.encode('utf-8')

        if not r_binary.exists(key_bytes):
            logger.warning(f"Document not found for PDF retrieval: {key}")
            return jsonify({'error': 'Document not found'}), 404

        if not r_binary.hexists(key_bytes, b'pdf_data'):
            logger.warning(f"Document has no PDF data: {key}")
            return jsonify({'error': 'Document has no PDF data'}), 404

        pdf_data = r_binary.hget(key_bytes, b'pdf_data')
        if not pdf_data: # Should be caught by hexists, but good for safety
            logger.warning(f"PDF data is empty for key: {key} despite hexists check.")
            return jsonify({'error': 'PDF data is empty'}), 404


        doc_name_bytes = r_binary.hget(key_bytes, b'name')
        doc_name = key.split(':')[-1] # Default name
        if doc_name_bytes:
            try:
                doc_name = doc_name_bytes.decode('utf-8', errors='replace')
            except Exception as e:
                logger.warning(f"Could not decode name for PDF {key}: {e}")
        
        pdf_io = io.BytesIO(pdf_data)
        # pdf_io.seek(0) # BytesIO is already at position 0 initially

        logger.info(f"Serving PDF for key: {key}, name: {doc_name}.pdf")
        return send_file(
            pdf_io,
            mimetype='application/pdf',
            as_attachment=False, # inline display
            download_name=f"{doc_name}.pdf"
        )
    except redis.RedisError as e:
        logger.error(f"Redis error in get_pdf_by_full_key for key {key}: {str(e)}", exc_info=True)
        return jsonify({'error': 'Error connecting to data store'}), 503
    except Exception as e:
        logger.error(f"Error in get_pdf_by_full_key for key {key}: {str(e)}", exc_info=True)
        return jsonify({'error': 'An internal server error occurred'}), 500

@pdf_bp.route('/by-short-id/<doc_id_short>', methods=['GET'])
def get_document_pdf_by_short_id(doc_id_short: str): 
    """
    Retrieve a PDF document using a short document ID.
    The short ID is typically the suffix of the full Redis key.

    Method: GET
    URL: /by-short-id/<doc_id_short> (relative to blueprint prefix /api/v1/pdfs)
    Parameters:
        - Path:
            - `doc_id_short` (string, required): The short ID of the document.
              This will be appended to "doc:brasov-cursuri:" to form the full key.
    Success Response (200 OK):
        Content-Type: application/pdf
        Body: The binary PDF data. The 'Content-Disposition' will be set to
              inline with filename "{document_name_from_redis_or_short_id}.pdf".
    Error Responses:
        404 Not Found:
            - If the constructed document key does not exist in Redis.
              {"error": "Document not found"}
            - If the document exists but has no 'pdf_data' field.
              {"error": "No PDF data for this document"}
        503 Service Unavailable: If connection to Redis fails.
            {"error": "Error connecting to data store"}
        500 Internal Server Error: For other unexpected errors.
            {"error": "An internal server error occurred"}
    """
    try:
        r_binary = get_binary_redis_connection()
        
        # Construct full key from short ID
        # This assumes doc_id_short is the part after "doc:brasov-cursuri:"
        full_key = f'doc:brasov-cursuri:{doc_id_short}'
        logger.info(f"Attempting to retrieve PDF for short_id: {doc_id_short} (resolved as {full_key})")
        
        key_bytes = full_key.encode('utf-8')

        if not r_binary.exists(key_bytes):
            logger.warning(f"Document not found for PDF retrieval by short_id: {doc_id_short} (key: {full_key})")
            return jsonify({'error': 'Document not found'}), 404

        pdf_data = r_binary.hget(key_bytes, b'pdf_data')
        if not pdf_data:
            logger.warning(f"No PDF data for document: {full_key}")
            return jsonify({'error': 'No PDF data for this document'}), 404

        # Use the short ID or last part of full key for filename if name field is not present
        doc_name_display = doc_id_short 
        name_bytes = r_binary.hget(key_bytes, b'name')
        if name_bytes:
            try:
                doc_name_display = name_bytes.decode('utf-8', errors='replace')
            except Exception:
                pass # Keep doc_id_short as name

        response = make_response(pdf_data)
        response.headers.set('Content-Type', 'application/pdf')
        response.headers.set('Content-Disposition', f'inline; filename="{doc_name_display}.pdf"')
        logger.info(f"Serving PDF for doc_id: {full_key}")
        return response
    except redis.RedisError as e:
        logger.error(f"Redis error in get_document_pdf_by_short_id for {doc_id_short}: {str(e)}", exc_info=True)
        return jsonify({'error': 'Error connecting to data store'}), 503
    except Exception as e:
        logger.error(f"Error in get_document_pdf_by_short_id for {doc_id_short}: {str(e)}", exc_info=True)
        return jsonify({'error': 'An internal server error occurred'}), 500
