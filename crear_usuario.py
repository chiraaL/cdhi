"""
crear_usuario.py — Crea un usuario en MySQL desde la terminal.

Uso:
    python crear_usuario.py

Seguridad:
- La contraseña se pide con getpass (no se ve en pantalla).
- Mínimo de 8 caracteres.
- Se usa werkzeug: genera hash PBKDF2, compatible con
  check_password_hash del login en app.py.
"""

import getpass
import sys

import pymysql
from werkzeug.security import generate_password_hash

from config import MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB


def main():
    username = input("Nombre de usuario nuevo: ").strip()
    password = getpass.getpass("Contraseña: ")
    password2 = getpass.getpass("Repetí la contraseña: ")

    if not username or not password:
        sys.exit("Usuario y contraseña no pueden estar vacíos.")
    if len(username) > 50:
        sys.exit("El nombre de usuario no puede superar los 50 caracteres.")
    if password != password2:
        sys.exit("Las contraseñas no coinciden.")
    if len(password) < 8:
        sys.exit("La contraseña debe tener al menos 8 caracteres.")

    conn = pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DB,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM usuarios WHERE username = %s", (username,)
            )
            existente = cur.fetchone()
            if existente is not None:
                sys.exit(f"Ya existe un usuario '{username}'. No se creó nada.")

            cur.execute(
                "INSERT INTO usuarios (username, password_hash) VALUES (%s, %s)",
                (username, generate_password_hash(password)),
            )
        conn.commit()
        print(f"Usuario '{username}' creado. Ya puede iniciar sesión en la web.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
