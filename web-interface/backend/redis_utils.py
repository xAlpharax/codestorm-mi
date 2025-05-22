import redis
from flask import g
import logging
from .config import REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_PASSWORD

logger = logging.getLogger("EduAPI") # Get logger configured in app.py

# Initialize connection pools - these will be set by init_redis_pools
redis_pool = None
binary_redis_pool = None

def init_redis_pools():
    """
    Initializes Redis connection pools.
    This function should be called once at application startup.
    """
    global redis_pool, binary_redis_pool
    try:
        logger.info(f"Initializing Redis connection pool for text data at {REDIS_HOST}:{REDIS_PORT} DB {REDIS_DB}...")
        redis_pool = redis.ConnectionPool(
            host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, password=REDIS_PASSWORD,
            decode_responses=True, socket_connect_timeout=5, socket_keepalive=True
        )
        # Test connection
        r = redis.Redis(connection_pool=redis_pool)
        r.ping()
        logger.info("Successfully connected to Redis (text data pool).")
    except redis.exceptions.ConnectionError as e:
        logger.error(f"Could not connect to Redis (text data pool): {e}", exc_info=True)
        raise ConnectionError(f"Failed to connect to Redis (text data pool): {e}")
    except redis.exceptions.AuthenticationError as e:
        logger.error(f"Redis authentication failed for text data pool. Error: {e}", exc_info=True)
        raise ConnectionError("Redis authentication failed for text data pool.")
    except Exception as e:
        logger.error(f"An unexpected error occurred during text Redis pool initialization: {e}", exc_info=True)
        raise ConnectionError(f"Unexpected Redis text pool initialization error: {e}")

    try:
        logger.info(f"Initializing Redis connection pool for binary data at {REDIS_HOST}:{REDIS_PORT} DB {REDIS_DB}...")
        binary_redis_pool = redis.ConnectionPool(
            host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, password=REDIS_PASSWORD,
            decode_responses=False, socket_connect_timeout=5, socket_keepalive=True
        )
        # Test connection
        r_binary = redis.Redis(connection_pool=binary_redis_pool)
        r_binary.ping()
        logger.info("Successfully connected to Redis (binary data pool).")
    except redis.exceptions.ConnectionError as e:
        logger.error(f"Could not connect to Redis (binary data pool): {e}", exc_info=True)
        raise ConnectionError(f"Failed to connect to Redis (binary data pool): {e}")
    except redis.exceptions.AuthenticationError as e:
        logger.error(f"Redis authentication failed for binary data pool. Error: {e}", exc_info=True)
        raise ConnectionError("Redis authentication failed for binary data pool.")
    except Exception as e:
        logger.error(f"An unexpected error occurred during binary Redis pool initialization: {e}", exc_info=True)
        raise ConnectionError(f"Unexpected Redis binary pool initialization error: {e}")

def get_redis_connection():
    """Provides a Redis connection from the pool for text data (decode_responses=True)."""
    if 'redis_db' not in g:
        if not redis_pool:
            logger.error("Redis pool (text) not initialized. Call init_redis_pools() at startup.")
            raise ConnectionError("Redis pool (text) not initialized.")
        g.redis_db = redis.Redis(connection_pool=redis_pool)
    return g.redis_db

def get_binary_redis_connection():
    """Provides a Redis connection from the pool for binary data (decode_responses=False)."""
    if 'binary_redis_db' not in g:
        if not binary_redis_pool:
            logger.error("Redis pool (binary) not initialized. Call init_redis_pools() at startup.")
            raise ConnectionError("Redis pool (binary) not initialized.")
        g.binary_redis_db = redis.Redis(connection_pool=binary_redis_pool)
    return g.binary_redis_db

def teardown_redis_connections(exception=None):
    """Cleans up Redis connections from Flask's g object after a request."""
    # Connections are returned to the pool automatically by redis-py.
    # This function primarily cleans up flask.g.
    db = g.pop('redis_db', None)
    if db is not None:
        pass # logger.debug("Popped redis_db from g")
    binary_db = g.pop('binary_redis_db', None)
    if binary_db is not None:
        pass # logger.debug("Popped binary_redis_db from g")

def register_teardown(app):
    """Registers the teardown function with the Flask app."""
    app.teardown_appcontext(teardown_redis_connections)
