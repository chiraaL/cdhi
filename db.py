"""
db.py — Capa de acceso a MySQL.

Decisiones de diseño clave:

- Las credenciales vienen del entorno (config.py), no del código.
- No hay CORS abierto (Access-Control-Allow-Origin: *): frontend y
  backend viven en el mismo origen, así que no hace falta.
- El context manager "db()" abre una transacción y hace commit/rollback
  automáticamente: si algo falla a medio camino, la base queda como
  estaba (atomicidad real).
"""

from contextlib import contextmanager

import pymysql

from config import MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB


class Cursor(pymysql.cursors.DictCursor):
    """Cursor que se devuelve a sí mismo desde execute().

    En PyMySQL, execute() devuelve la cantidad de filas afectadas (int),
    pero app.py usa la API estilo sqlite3: conn.execute(...).fetchone().
    Con este adaptador, execute() devuelve el cursor y el encadenamiento
    funciona; además conserva .lastrowid, .fetchone() (filas como
    diccionarios) y .fetchall().
    """

    def execute(self, query, args=None):
        super().execute(query, args)
        return self


def get_connection():
    """Abre una conexión nueva a MySQL. Una por solicitud, sin pool (suficiente
    para un pañol escolar; si escala, migrar a SQLAlchemy con pool)."""
    return pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DB,
        charset="utf8mb4",
        cursorclass=Cursor,               # filas como diccionarios + API sqlite3
        autocommit=False,
        connect_timeout=5,                # falla rápido si MySQL no responde
    )


@contextmanager
def db():
    """
    Uso:
        with db() as conn:
            conn.execute("INSERT INTO ...", (valor,))   # %s, nunca f-strings
    El objeto entregado es un Cursor de db.py (DictCursor con
    execute() que devuelve el cursor): soporta .execute()/.fetchone()/
    .fetchall()/.lastrowid, la misma forma de usarlo que la API de
    sqlite3 del resto del código.
    Si el bloque termina bien → COMMIT. Si lanza excepción → ROLLBACK.
    En cualquier caso, cursor y conexión se cierran solos.
    """
    conn = get_connection()
    cur = None
    try:
        cur = conn.cursor()
        yield cur
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        if cur is not None:
            cur.close()
        conn.close()
