"""
Ensure the backend root is on sys.path so the layered top-level packages
(`domain`, `application`, `infrastructure`) import cleanly under any pytest import
mode. (Django apps under `apps/` already resolve via the project layout.)
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
