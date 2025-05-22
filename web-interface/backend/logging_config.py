import logging
import sys # To ensure stdout for stream handler

def setup_logging():
    """Configures and returns a logger instance."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(name)s - %(module)s - %(funcName)s - %(lineno)d - %(message)s',
        handlers=[logging.StreamHandler(sys.stdout)] # Explicitly use sys.stdout
    )
    # Get the root logger or a specific logger
    # Using __name__ will give 'logging_config' here, which is fine.
    # If used across modules, child loggers (e.g., logging.getLogger(__name__)) in those modules
    # will inherit this basicConfig by default.
    logger = logging.getLogger("EduAPI") # Using a common parent name for all app loggers
    logger.info("Logging configured.")
    return logger

# Global logger instance if you prefer to import it directly,
# or you can call setup_logging() in app.py and pass/store the logger.
# For simplicity of import across modules, a global instance is often easier.
# logger = setup_logging() # This would execute on import, might be too early.
# Better to call setup_logging() from app.py and then other modules can get logging.getLogger("EduAPI")
# For now, this file just provides the setup function.

# Example of how other modules would get the logger after setup_logging() has been called once:
# import logging
# logger = logging.getLogger("EduAPI")
