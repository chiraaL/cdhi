"""
config.py — Configuración central de C.D.H.I.

Toda la configuración viene de variables de entorno (archivo .env en
desarrollo, variables del sistema en producción). Las credenciales de
MySQL nunca viven en el código fuente.
"""

import os

from dotenv import load_dotenv

load_dotenv()  # Lee .env si existe (en producción usamos variables reales)

SECRET_KEY = os.environ.get("SECRET_KEY", "").strip()
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY no está definida.\n"
        "  1. Copiá .env.example a .env\n"
        '  2. Generá una clave: python -c "import secrets; print(secrets.token_hex(32))"\n'
        "  3. Pegá esa clave en SECRET_KEY="
    )

MYSQL_HOST = os.environ.get("MYSQL_HOST", "127.0.0.1")
try:
    MYSQL_PORT = int(os.environ.get("MYSQL_PORT", "3306"))
except ValueError as error:
    raise RuntimeError("MYSQL_PORT debe ser un número entre 1 y 65535.") from error
if not 1 <= MYSQL_PORT <= 65535:
    raise RuntimeError("MYSQL_PORT debe ser un número entre 1 y 65535.")
MYSQL_USER = os.environ.get("MYSQL_USER", "cdhi")
MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "")
MYSQL_DB = os.environ.get("MYSQL_DB", "cdhi")
