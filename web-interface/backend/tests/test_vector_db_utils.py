import unittest
from unittest import mock
import requests # For requests.exceptions

# Assuming backend.vector_db_utils can be imported
from backend import vector_db_utils
from backend.config import VECTOR_UPSERT_API_URL, VECTOR_SEARCH_API_URL


class TestVectorDBUtils(unittest.TestCase):

    def setUp(self):
        # Patch logger to avoid actual logging output during tests
        self.logger_patcher = mock.patch('backend.vector_db_utils.logger')
        self.mock_logger = self.logger_patcher.start()

    def tearDown(self):
        self.logger_patcher.stop()

    @mock.patch('requests.post')
    def test_store_document_in_vector_db_success(self, mock_post):
        """Test successful document storage in vector DB."""
        mock_response = mock.Mock()
        mock_response.json.return_value = {"status": "success", "id": "doc123"}
        mock_response.raise_for_status.return_value = None # Simulate no HTTP error
        mock_post.return_value = mock_response

        text_to_store = "This is a test document."
        result = vector_db_utils.store_document_in_vector_db(text_to_store, key="test_key_1")

        self.assertIsNotNone(result)
        self.assertEqual(result["status"], "success")
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        self.assertEqual(args[0], VECTOR_UPSERT_API_URL)
        self.assertIn("text", kwargs["json"]["overrideConfig"])
        self.assertEqual(kwargs["json"]["overrideConfig"]["text"], text_to_store)
        self.assertIn("metadata", kwargs["json"]["overrideConfig"])
        self.assertEqual(kwargs["json"]["overrideConfig"]["metadata"]["key"], "test_key_1")
        self.mock_logger.info.assert_any_call(f"Storing document in vector DB (key: test_key_1). Text preview: {text_to_store[:100]}...")


    @mock.patch('requests.post')
    def test_store_document_in_vector_db_success_no_key(self, mock_post):
        """Test successful document storage without an explicit key."""
        mock_response = mock.Mock()
        mock_response.json.return_value = {"status": "success", "id": "doc456"}
        mock_response.raise_for_status.return_value = None
        mock_post.return_value = mock_response

        text_to_store = "Another test document."
        result = vector_db_utils.store_document_in_vector_db(text_to_store) # No key

        self.assertIsNotNone(result)
        self.assertEqual(result["id"], "doc456")
        args, kwargs = mock_post.call_args
        self.assertNotIn("metadata", kwargs["json"]["overrideConfig"]) # No key, so no metadata field
        self.mock_logger.info.assert_any_call(f"Storing document in vector DB (key: N/A). Text preview: {text_to_store[:100]}...")


    @mock.patch('requests.post')
    def test_store_document_in_vector_db_api_error(self, mock_post):
        """Test API error (e.g., 500) during document storage."""
        mock_post.side_effect = requests.exceptions.RequestException("API is down")

        result = vector_db_utils.store_document_in_vector_db("Test text", key="error_key")
        
        self.assertIsNone(result)
        self.mock_logger.error.assert_called_once()
        self.assertIn("Error storing document in vector DB (key: error_key)", self.mock_logger.error.call_args[0][0])


    @mock.patch('requests.post')
    def test_store_document_in_vector_db_http_error(self, mock_post):
        """Test HTTP error (e.g., 401) during document storage."""
        mock_response = mock.Mock()
        mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError("Unauthorized")
        mock_post.return_value = mock_response

        result = vector_db_utils.store_document_in_vector_db("Test text for HTTP error", key="http_error_key")

        self.assertIsNone(result)
        self.mock_logger.error.assert_called_once()
        self.assertIn("Error storing document in vector DB (key: http_error_key)", self.mock_logger.error.call_args[0][0])


    @mock.patch('requests.post')
    def test_store_document_in_vector_db_timeout(self, mock_post):
        """Test timeout during document storage."""
        mock_post.side_effect = requests.exceptions.Timeout("Request timed out")

        result = vector_db_utils.store_document_in_vector_db("Test text for timeout", key="timeout_key")

        self.assertIsNone(result)
        self.mock_logger.error.assert_called_once()
        self.assertIn("Timeout storing document in vector DB (key: timeout_key)", self.mock_logger.error.call_args[0][0])


    @mock.patch('requests.post')
    def test_search_vector_db_success(self, mock_post):
        """Test successful search in vector DB."""
        mock_response = mock.Mock()
        expected_results = {"matches": [{"id": "doc1", "score": 0.9}]}
        mock_response.json.return_value = expected_results
        mock_response.raise_for_status.return_value = None
        mock_post.return_value = mock_response

        query_text = "search for this"
        limit = 5
        result = vector_db_utils.search_vector_db(query_text, limit=limit)

        self.assertIsNotNone(result)
        self.assertEqual(result, expected_results)
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        self.assertEqual(args[0], VECTOR_SEARCH_API_URL)
        self.assertEqual(kwargs["json"]["overrideConfig"]["query"], query_text)
        self.assertEqual(kwargs["json"]["overrideConfig"]["limit"], limit)
        self.mock_logger.info.assert_any_call(f"Searching vector DB with query: '{query_text}', limit: {limit}")


    @mock.patch('requests.post')
    def test_search_vector_db_api_error(self, mock_post):
        """Test API error during search."""
        mock_post.side_effect = requests.exceptions.RequestException("Search API is down")

        result = vector_db_utils.search_vector_db("some query")
        
        self.assertIsNone(result)
        self.mock_logger.error.assert_called_once()
        self.assertIn("Error searching vector DB for query: 'some query'", self.mock_logger.error.call_args[0][0])


    @mock.patch('requests.post')
    def test_search_vector_db_http_error(self, mock_post):
        """Test HTTP error during search."""
        mock_response = mock.Mock()
        mock_response.raise_for_status.side_effect = requests.exceptions.HTTPError("Forbidden")
        mock_post.return_value = mock_response

        result = vector_db_utils.search_vector_db("another query")

        self.assertIsNone(result)
        self.mock_logger.error.assert_called_once()
        self.assertIn("Error searching vector DB for query: 'another query'", self.mock_logger.error.call_args[0][0])


    @mock.patch('requests.post')
    def test_search_vector_db_timeout(self, mock_post):
        """Test timeout during search."""
        mock_post.side_effect = requests.exceptions.Timeout("Search request timed out")
        
        result = vector_db_utils.search_vector_db("query for timeout")

        self.assertIsNone(result)
        self.mock_logger.error.assert_called_once()
        self.assertIn("Timeout searching vector DB for query: 'query for timeout'", self.mock_logger.error.call_args[0][0])

if __name__ == '__main__':
    unittest.main()
