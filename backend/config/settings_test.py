"""
Test settings.

Production settings are fail-closed: DEBUG defaults to False, which requires a
real SECRET_KEY and explicit ALLOWED_HOSTS (see config/settings.py + security.py).
The test suite runs in DEBUG mode so it works over plain HTTP (no SSL redirect)
and uses the dev SECRET_KEY / localhost hosts. The fail-closed production
behaviour itself is unit-tested in config/test_security.py.
"""
import os

os.environ.setdefault("DEBUG", "True")

from config.settings import *  # noqa: F401,F403,E402
