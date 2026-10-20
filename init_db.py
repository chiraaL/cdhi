"""
init_db.py — Crea la base de datos y el esquema en MySQL.

Uso (una sola vez, o para resetear datos de prueba):

    python init_db.py

El esquema se crea con InnoDB (claves foráneas siempre activas) y
charset utf8mb4. Las columnas es_qr y qr_codigo ya existen desde el
inicio, y la tabla de notas arranca con su fila fija id=1.
"""

import re
import sys

import pymysql

from config import MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB

# El nombre de base no puede parametrizarse en SQL; lo validamos a mano.
if not re.fullmatch(r"[A-Za-z0-9_]+", MYSQL_DB):
    sys.exit(f"Nombre de base inválido: {MYSQL_DB}")

ESQUEMA = """
CREATE TABLE IF NOT EXISTS usuarios (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    username     VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS herramientas (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL,
    descripcion TEXT,
    imagen      VARCHAR(255) NOT NULL DEFAULT 'martillo.png',
    cantidad    INT NOT NULL DEFAULT 0,
    es_qr       TINYINT NOT NULL DEFAULT 0,
    qr_codigo   VARCHAR(100) NULL,
    INDEX idx_qr (es_qr, qr_codigo),
    UNIQUE INDEX ux_qr_codigo (qr_codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tags (
    id    INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS herramienta_tag (
    herramienta_id INT NOT NULL,
    tag_id         INT NOT NULL,
    PRIMARY KEY (herramienta_id, tag_id),
    FOREIGN KEY (herramienta_id) REFERENCES herramientas(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prestamos (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    profesor      VARCHAR(100) NOT NULL,
    alumno        VARCHAR(100),
    curso         VARCHAR(50),
    fecha_salida  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_entrada TIMESTAMP NULL,
    estado        VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    INDEX idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prestamo_item (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    prestamo_id    INT NOT NULL,
    herramienta_id INT NOT NULL,
    cantidad       INT NOT NULL,
    FOREIGN KEY (prestamo_id) REFERENCES prestamos(id) ON DELETE CASCADE,
    FOREIGN KEY (herramienta_id) REFERENCES herramientas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notas (
    id                  INT PRIMARY KEY,          -- siempre 1
    texto               TEXT NOT NULL,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""


def main():
    # 1) Conectar SIN base para poder crearla si no existe
    conn = pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        charset="utf8mb4",
        autocommit=True,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"CREATE DATABASE IF NOT EXISTS `{MYSQL_DB}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
            cur.execute(f"USE `{MYSQL_DB}`")

            for sentencia in [s.strip() for s in ESQUEMA.split(";") if s.strip()]:
                cur.execute(sentencia)

            # Fila fija del bloc de notas (id siempre = 1)
            cur.execute(
                "INSERT IGNORE INTO notas (id, texto) VALUES (1, '')"
            )
        print(f"Base de datos lista en MySQL: {MYSQL_DB}@{MYSQL_HOST}:{MYSQL_PORT}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
