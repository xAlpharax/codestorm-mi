import requests
import logging
from .config import VECTOR_UPSERT_API_URL, VECTOR_SEARCH_API_URL

logger = logging.getLogger("EduAPI")

def store_document_in_vector_db(text, key=None):
    """Store document text in vector database for semantic search using Flowise API"""
    try:
        payload = {
            "overrideConfig": {
                "text": text,
            }
        }
        if key:
            payload["overrideConfig"]["metadata"] = {"key": key}
        logger.info(f"Storing document in vector DB (key: {key if key else 'N/A'}). Text preview: {text[:100]}...")
        response = requests.post(VECTOR_UPSERT_API_URL, json=payload, timeout=15)
        response.raise_for_status()
        result = response.json()
        logger.info(f"Vector DB upsert response: {result}")
        return result
    except requests.exceptions.Timeout:
        logger.error(f"Timeout storing document in vector DB (key: {key})", exc_info=True)
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Error storing document in vector DB (key: {key}): {e}", exc_info=True)
        return None
    except Exception as e: # Catch other potential errors like JSON parsing
        logger.error(f"Unexpected error storing document in vector DB (key: {key}): {e}", exc_info=True)
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
        logger.info(f"Searching vector DB with query: '{query_text}', limit: {limit}")
        response = requests.post(VECTOR_SEARCH_API_URL, json=payload, timeout=15)
        response.raise_for_status()
        result = response.json()
        logger.debug(f"Vector DB search response: {result}")
        return result
    except requests.exceptions.Timeout:
        logger.error(f"Timeout searching vector DB for query: '{query_text}'", exc_info=True)
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Error searching vector DB for query: '{query_text}': {e}", exc_info=True)
        return None
    except Exception as e: # Catch other potential errors like JSON parsing
        logger.error(f"Unexpected error searching vector DB for query: '{query_text}': {e}", exc_info=True)
        return None
