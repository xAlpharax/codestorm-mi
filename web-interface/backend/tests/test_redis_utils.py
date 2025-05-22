import pytest
import unittest
from unittest import mock
from flask import Flask # For creating an app context
import redis # For actual Redis exception types

# Assuming backend.redis_utils can be imported.
# This requires __init__.py in backend and backend/tests if not already present
# and running pytest from the parent directory of 'backend'.
from backend import redis_utils 
from backend.config import REDIS_HOST, REDIS_PORT, REDIS_DB, REDIS_PASSWORD


class TestRedisUtils(unittest.TestCase):

    def setUp(self):
        # Create a Flask app for context
        self.app = Flask(__name__)
        self.app_context = self.app.app_context()
        self.app_context.push() # Push an application context

        # Reset global pools before each test to ensure isolation
        redis_utils.redis_pool = None
        redis_utils.binary_redis_pool = None
        
        # Patch logger to avoid actual logging output during tests
        self.logger_patcher = mock.patch('backend.redis_utils.logger')
        self.mock_logger = self.logger_patcher.start()

    def tearDown(self):
        self.app_context.pop() # Pop the application context
        self.logger_patcher.stop()


    @mock.patch('redis.Redis')
    @mock.patch('redis.ConnectionPool')
    def test_init_redis_pools_success(self, MockConnectionPool, MockRedis):
        """Test successful initialization of both Redis pools."""
        mock_pool_instance = MockConnectionPool.return_value
        mock_redis_instance = MockRedis.return_value
        mock_redis_instance.ping.return_value = True

        redis_utils.init_redis_pools()

        self.assertEqual(MockConnectionPool.call_count, 2)
        self.assertEqual(MockRedis.call_count, 2)
        mock_redis_instance.ping.assert_has_calls([mock.call(), mock.call()])
        
        self.assertIsNotNone(redis_utils.redis_pool)
        self.assertIsNotNone(redis_utils.binary_redis_pool)
        self.mock_logger.info.assert_any_call(f"Initializing Redis connection pool for text data at {REDIS_HOST}:{REDIS_PORT} DB {REDIS_DB}...")
        self.mock_logger.info.assert_any_call("Successfully connected to Redis (text data pool).")
        self.mock_logger.info.assert_any_call(f"Initializing Redis connection pool for binary data at {REDIS_HOST}:{REDIS_PORT} DB {REDIS_DB}...")
        self.mock_logger.info.assert_any_call("Successfully connected to Redis (binary data pool).")


    @mock.patch('redis.ConnectionPool')
    @mock.patch('redis.Redis')
    def test_init_redis_pools_connection_error_text(self, MockRedis, MockConnectionPool):
        """Test ConnectionError during text pool initialization."""
        MockConnectionPool.return_value # Ensure it's a mock
        mock_redis_instance = MockRedis.return_value
        # First call to ConnectionPool succeeds, first ping fails
        mock_redis_instance.ping.side_effect = [redis.exceptions.ConnectionError("Text pool connection failed"), True]

        with self.assertRaises(ConnectionError) as cm:
            redis_utils.init_redis_pools()
        self.assertIn("Failed to connect to Redis (text data pool)", str(cm.exception))
        self.mock_logger.error.assert_called_once()


    @mock.patch('redis.ConnectionPool')
    @mock.patch('redis.Redis')
    def test_init_redis_pools_connection_error_binary(self, MockRedis, MockConnectionPool):
        """Test ConnectionError during binary pool initialization."""
        MockConnectionPool.return_value 
        mock_redis_instance = MockRedis.return_value
        # First ping (text pool) succeeds, second ping (binary pool) fails
        mock_redis_instance.ping.side_effect = [True, redis.exceptions.ConnectionError("Binary pool connection failed")]
        
        with self.assertRaises(ConnectionError) as cm:
            redis_utils.init_redis_pools()
        self.assertIn("Failed to connect to Redis (binary data pool)", str(cm.exception))
        self.mock_logger.error.assert_called_once() # Because text pool init succeeded first.


    @mock.patch('redis.ConnectionPool')
    @mock.patch('redis.Redis')
    def test_init_redis_pools_auth_error_text(self, MockRedis, MockConnectionPool):
        """Test AuthenticationError during text pool initialization."""
        MockConnectionPool.return_value
        mock_redis_instance = MockRedis.return_value
        mock_redis_instance.ping.side_effect = [redis.exceptions.AuthenticationError("Text auth failed"), True]

        with self.assertRaises(ConnectionError) as cm:
            redis_utils.init_redis_pools()
        self.assertIn("Redis authentication failed for text data pool", str(cm.exception))


    @mock.patch('redis.ConnectionPool')
    @mock.patch('redis.Redis')
    def test_init_redis_pools_auth_error_binary(self, MockRedis, MockConnectionPool):
        """Test AuthenticationError during binary pool initialization."""
        MockConnectionPool.return_value
        mock_redis_instance = MockRedis.return_value
        mock_redis_instance.ping.side_effect = [True, redis.exceptions.AuthenticationError("Binary auth failed")]
        
        with self.assertRaises(ConnectionError) as cm:
            redis_utils.init_redis_pools()
        self.assertIn("Redis authentication failed for binary data pool", str(cm.exception))


    @mock.patch('redis.Redis')
    def test_get_redis_connection_new(self, MockRedis):
        """Test get_redis_connection when no connection exists in g."""
        # Setup: Ensure pool is 'initialized' (mocked)
        redis_utils.redis_pool = mock.Mock(spec=redis.ConnectionPool)
        mock_redis_instance = MockRedis.return_value
        
        conn = redis_utils.get_redis_connection()

        self.assertIsNotNone(conn)
        self.assertEqual(conn, mock_redis_instance)
        self.assertIn('redis_db', self.app.extensions['flask_sqlalchemy_local']) # flask.g is proxied here in tests
        self.assertEqual(self.app.extensions['flask_sqlalchemy_local'].redis_db, mock_redis_instance)
        MockRedis.assert_called_once_with(connection_pool=redis_utils.redis_pool)

    @mock.patch('redis.Redis')
    def test_get_redis_connection_existing(self, MockRedis):
        """Test get_redis_connection when a connection already exists in g."""
        mock_existing_conn = mock.Mock(spec=redis.Redis)
        self.app.extensions['flask_sqlalchemy_local'].redis_db = mock_existing_conn # Pre-populate g

        conn = redis_utils.get_redis_connection()
        
        self.assertEqual(conn, mock_existing_conn)
        MockRedis.assert_not_called() # Should not create a new Redis instance

    def test_get_redis_connection_pool_not_initialized(self):
        """Test get_redis_connection when the pool is not initialized."""
        redis_utils.redis_pool = None # Ensure pool is not initialized
        with self.assertRaises(ConnectionError) as cm:
            redis_utils.get_redis_connection()
        self.assertIn("Redis pool (text) not initialized", str(cm.exception))


    @mock.patch('redis.Redis')
    def test_get_binary_redis_connection_new(self, MockRedis):
        """Test get_binary_redis_connection when no connection exists in g."""
        redis_utils.binary_redis_pool = mock.Mock(spec=redis.ConnectionPool)
        mock_redis_instance = MockRedis.return_value
        
        conn = redis_utils.get_binary_redis_connection()

        self.assertIsNotNone(conn)
        self.assertEqual(conn, mock_redis_instance)
        self.assertIn('binary_redis_db', self.app.extensions['flask_sqlalchemy_local'])
        self.assertEqual(self.app.extensions['flask_sqlalchemy_local'].binary_redis_db, mock_redis_instance)
        MockRedis.assert_called_once_with(connection_pool=redis_utils.binary_redis_pool)

    def test_get_binary_redis_connection_pool_not_initialized(self):
        """Test get_binary_redis_connection when the binary pool is not initialized."""
        redis_utils.binary_redis_pool = None
        with self.assertRaises(ConnectionError) as cm:
            redis_utils.get_binary_redis_connection()
        self.assertIn("Redis pool (binary) not initialized", str(cm.exception))

    def test_teardown_redis_connections(self):
        """Test that teardown_redis_connections removes connections from g."""
        self.app.extensions['flask_sqlalchemy_local'].redis_db = mock.Mock()
        self.app.extensions['flask_sqlalchemy_local'].binary_redis_db = mock.Mock()

        redis_utils.teardown_redis_connections()

        self.assertNotIn('redis_db', self.app.extensions['flask_sqlalchemy_local'])
        self.assertNotIn('binary_redis_db', self.app.extensions['flask_sqlalchemy_local'])

    def test_register_teardown(self):
        """Test that register_teardown registers the teardown function."""
        mock_app = mock.Mock(spec=Flask)
        redis_utils.register_teardown(mock_app)
        mock_app.teardown_appcontext.assert_called_once_with(redis_utils.teardown_redis_connections)

if __name__ == '__main__':
    unittest.main()
