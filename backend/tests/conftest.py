import os
import sys

os.environ.setdefault("YOUTUBE_API_KEY", "test-key")
os.environ["FRONTEND_URL"] = "http://localhost:5173"
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
