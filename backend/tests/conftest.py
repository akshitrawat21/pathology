"""Test configuration: point the app at throwaway SQLite + storage before it
is imported anywhere."""
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="pathology-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{os.path.join(_tmp, 'test.db')}"
os.environ["STORAGE_DIR"] = os.path.join(_tmp, "storage")
os.environ["SECRET_KEY"] = "test-secret"
os.environ["ALLOW_DEV_LOGIN"] = "true"
os.environ["GOOGLE_CLIENT_ID"] = ""
