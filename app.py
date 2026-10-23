"""
app.py — Backend de C.D.H.I. (Flask + MySQL).

Páginas HTML (Jinja2) y API REST en un único servidor:

    POST   /api/login                      Iniciar sesión
    GET    /api/check-session              Estado de la sesión
    POST   /api/logout                     Cerrar sesión
    GET    /api/herramientas               Catálogo con tags
    GET    /api/herramientas/por-qr/<c>    Buscar por código QR
    POST   /api/herramientas               Crear herramienta
    PUT    /api/herramientas/<id>          Editar herramienta
    DELETE /api/herramientas/<id>          Borrar herramienta
    POST   /api/upload-imagen              Subir imagen a static/img/
    GET    /api/prestamos                  Encargos (filtrar por ?estado=)
    POST   /api/prestamos                  Registrar salida
    POST   /api/prestamos/<id>/devolver    Devolver encargo
    GET    /api/movimientos                Log de hoy
    GET    /api/movimientos/descargar      Descargar log de hoy
    GET    /api/movimientos/descargar-anual  ZIP con los logs del año
    GET    /api/notas                      Leer bloc de notas
    PUT    /api/notas                      Guardar bloc de notas

Páginas:
    /                        -> redirige a /index o /login
    /login                   -> plantilla login.html (pública)
    /index                   -> inventario (requiere sesión)
    /gestionar-herramientas  -> ABM catálogo (requiere sesión)

Estáticos: CSS/JS/imágenes se sirven desde static/ (Flask lo hace solo).
"""

import csv
import datetime
import io
import os
import re
import uuid
import zipfile

from flask import (
    Flask, jsonify, redirect, render_template, request, send_file, session, url_for,
)
from werkzeug.security import check_password_hash
from werkzeug.utils import secure_filename

from config import SECRET_KEY
from db import db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REGISTROS_DIR = os.path.join(BASE_DIR, "registros")
IMG_DIR = os.path.join(BASE_DIR, "static", "img")
os.makedirs(REGISTROS_DIR, exist_ok=True)
os.makedirs(IMG_DIR, exist_ok=True)

EXTENSIONES_PERMITIDAS = {"png", "jpg", "jpeg", "gif", "webp"}

app = Flask(__name__)
app.secret_key = SECRET_KEY
app.config.update(
    MAX_CONTENT_LENGTH=5 * 1024 * 1024,   # 5 MB máx. de subida
    SESSION_COOKIE_HTTPONLY=True,           # JS no puede leer la cookie
    SESSION_COOKIE_SAMESITE="Lax",          # protección CSRF básica
    SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE", "").strip().lower()
    in {"1", "true", "yes", "on"},
)


@app.errorhandler(413)
def archivo_demasiado_grande(_error):
    return jsonify({"error": "La imagen es demasiado grande (máximo 5 MB)"}), 413


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def ruta_registro_hoy():
    return os.path.join(REGISTROS_DIR, datetime.date.today().isoformat() + ".csv")


def extension_permitida(nombre_archivo):
    return (
        "." in nombre_archivo
        and nombre_archivo.rsplit(".", 1)[1].lower() in EXTENSIONES_PERMITIDAS
    )


def contenido_imagen_valido(archivo, extension):
    firmas = {
        "png": lambda cabecera: cabecera.startswith(b"\x89PNG\r\n\x1a\n"),
        "jpg": lambda cabecera: cabecera.startswith(b"\xff\xd8\xff"),
        "jpeg": lambda cabecera: cabecera.startswith(b"\xff\xd8\xff"),
        "gif": lambda cabecera: cabecera.startswith((b"GIF87a", b"GIF89a")),
        "webp": lambda cabecera: (
            cabecera.startswith(b"RIFF") and cabecera[8:12] == b"WEBP"
        ),
    }
    cabecera = archivo.stream.read(12)
    archivo.stream.seek(0)
    return firmas[extension](cabecera)


def leer_json_objeto():
    """Devuelve el objeto JSON recibido, o None si el cuerpo no es un objeto."""
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def texto_de(data, campo, defecto=""):
    valor = data.get(campo, defecto)
    return valor.strip() if isinstance(valor, str) else None


def entero_en_rango(valor, minimo=0):
    """Convierte enteros JSON/string sin truncar floats ni aceptar booleanos."""
    if isinstance(valor, bool):
        return None
    if isinstance(valor, int):
        numero = valor
    elif isinstance(valor, str):
        valor = valor.strip()
        if len(valor) > 10 or not re.fullmatch(r"-?\d+", valor):
            return None
        numero = int(valor)
    else:
        return None
    return numero if minimo <= numero <= 2_147_483_647 else None


def valor_csv_seguro(valor):
    texto = str(valor or "")
    if texto.lstrip().startswith(("=", "+", "-", "@")):
        return "'" + texto
    return texto


def nombre_imagen_seguro(nombre):
    """Normaliza el nombre de una imagen: solo un nombre de
    archivo simple, sin rutas (evita '../' o rutas absolutas
    guardadas desde el cliente)."""
    limpio = secure_filename(str(nombre or "").strip())
    return limpio or "martillo.png"


def login_required_api(view):
    """Decorador para endpoints API: 401 JSON si no hay sesión."""
    from functools import wraps

    @wraps(view)
    def wrapper(*args, **kwargs):
        if "usuario_id" not in session:
            return jsonify({"error": "Necesitás iniciar sesión"}), 401
        return view(*args, **kwargs)

    return wrapper


def login_required_page(view):
    """Decorador para páginas HTML: redirige al login si no hay sesión."""
    from functools import wraps

    @wraps(view)
    def wrapper(*args, **kwargs):
        if "usuario_id" not in session:
            return redirect(url_for("login_page"))
        return view(*args, **kwargs)

    return wrapper


def herramienta_a_dict(fila):
    return {
        "id": fila["id"],
        "nombre": fila["nombre"],
        "descripcion": fila["descripcion"],
        "imagen": fila["imagen"],
        "cantidad": fila["cantidad"],
        "es_qr": bool(fila["es_qr"]),
        "qr_codigo": fila["qr_codigo"],
        "tags": [t.strip() for t in fila["tags"].split(",")] if fila.get("tags") else [],
    }


# SELECT reutilizable: herramienta + sus tags en una sola consulta
CONSULTA_HERRAMIENTA = """
    SELECT h.id, h.nombre, h.descripcion, h.imagen, h.cantidad, h.es_qr, h.qr_codigo,
           GROUP_CONCAT(t.nombre ORDER BY t.nombre SEPARATOR ',') AS tags
    FROM herramientas h
    LEFT JOIN herramienta_tag ht ON ht.herramienta_id = h.id
    LEFT JOIN tags t ON t.id = ht.tag_id
"""


def parse_tags(data):
    """Acepta tags como lista JSON o como string "a, b" (compatibilidad)."""
    tags = data.get("tags", [])
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]
    if not isinstance(tags, list) or any(not isinstance(tag, str) for tag in tags):
        return None
    tags = [tag.strip() for tag in tags]
    if any(len(tag) > 50 for tag in tags):
        return None
    return [tag for tag in tags if tag]


def leer_es_qr(data):
    valor = data.get("es_qr", False)
    if isinstance(valor, bool):
        return int(valor)
    if isinstance(valor, int) and valor in (0, 1):
        return valor
    return None


def guardar_tags(conn, herramienta_id, tags):
    """Reemplaza los tags de una herramienta (borra y reinserta)."""
    conn.execute("DELETE FROM herramienta_tag WHERE herramienta_id = %s", (herramienta_id,))
    for tag_nombre in tags:
        tag_nombre = tag_nombre.strip()
        if not tag_nombre:
            continue
        tag = conn.execute("SELECT id FROM tags WHERE nombre = %s", (tag_nombre,)).fetchone()
        if tag is None:
            cur = conn.execute("INSERT INTO tags (nombre) VALUES (%s)", (tag_nombre,))
            tag_id = cur.lastrowid
        else:
            tag_id = tag["id"]
        conn.execute(
            "INSERT IGNORE INTO herramienta_tag (herramienta_id, tag_id) VALUES (%s, %s)",
            (herramienta_id, tag_id),
        )


# Columnas del log CSV: una fila por herramienta y movimiento,
# para poder filtrar/ordenar en Excel o Google Sheets.
LOG_CSV_CABECERA = [
    "fecha", "hora", "tipo", "encargo_id",
    "profesor", "alumno", "curso",
    "herramienta_id", "herramienta", "cantidad",
]


def escribir_log(tipo, prestamo_id, profesor, alumno, curso, items):
    """Append al log diario en CSV (registros/AAAA-MM-DD.csv).

    items: lista de tuplas (herramienta_id, nombre, cantidad).
    tipo: "SALIDA" o "ENTRADA". utf-8-sig para que Excel
    abra bien las tildes. Si el archivo no existe, se
    escribe la fila de cabecera primero.
    """
    ahora = datetime.datetime.now()
    ruta = ruta_registro_hoy()
    with open(ruta, "a+", encoding="utf-8", newline="") as f:
        f.seek(0, os.SEEK_END)
        escritor = csv.writer(f)
        if f.tell() == 0:
            f.write("\ufeff")
            escritor.writerow(LOG_CSV_CABECERA)
        for herramienta_id, nombre, cantidad in items:
            escritor.writerow([
                ahora.date().isoformat(),
                ahora.strftime("%H:%M"),
                tipo,
                prestamo_id,
                valor_csv_seguro(profesor),
                valor_csv_seguro(alumno),
                valor_csv_seguro(curso),
                herramienta_id,
                valor_csv_seguro(nombre),
                cantidad,
            ])


# ---------------------------------------------------------------------------
# Páginas (Jinja2)
# ---------------------------------------------------------------------------

@app.route("/")
def home():
    if "usuario_id" in session:
        return redirect(url_for("index"))
    return redirect(url_for("login_page"))


@app.route("/login")
def login_page():
    if "usuario_id" in session:
        return redirect(url_for("index"))
    return render_template("login.html")


@app.route("/index")
@login_required_page
def index():
    return render_template("index.html", username=session.get("username", ""))


@app.route("/gestionar-herramientas")
@login_required_page
def gestionar_herramientas():
    return render_template("gestionar-herramientas.html", username=session.get("username", ""))


# ---------------------------------------------------------------------------
# Autenticación y sesión
# ---------------------------------------------------------------------------

@app.post("/api/login")
def api_login():
    data = leer_json_objeto()
    if data is None:
        return jsonify({"error": "Se esperaba un objeto JSON"}), 400
    username = texto_de(data, "username")
    password = data.get("password", "")
    if username is None or not isinstance(password, str):
        return jsonify({"error": "Usuario o contraseña inválidos"}), 400

    with db() as conn:
        usuario = conn.execute(
            "SELECT id, username, password_hash FROM usuarios WHERE username = %s",
            (username,),
        ).fetchone()

    # Un solo mensaje para ambos casos: no revelamos si el usuario existe.
    if (
        not username
        or len(username) > 50
        or not password
        or usuario is None
        or not check_password_hash(usuario["password_hash"], password)
    ):
        return jsonify({"error": "Usuario o contraseña incorrectos"}), 401

    session.permanent = True
    session["usuario_id"] = usuario["id"]
    session["username"] = usuario["username"]
    return jsonify({"ok": True, "username": usuario["username"]})


@app.post("/api/logout")
def api_logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/check-session")
def api_check_session():
    if "usuario_id" in session:
        return jsonify({"logueado": True, "username": session.get("username", "")})
    return jsonify({"logueado": False})


# ---------------------------------------------------------------------------
# Herramientas (catálogo)
# ---------------------------------------------------------------------------

@app.get("/api/herramientas")
@login_required_api
def listar_herramientas():
    with db() as conn:
        filas = conn.execute(CONSULTA_HERRAMIENTA + " GROUP BY h.id ORDER BY h.id DESC").fetchall()
    return jsonify([herramienta_a_dict(f) for f in filas])


@app.get("/api/herramientas/por-qr/<codigo>")
@login_required_api
def herramienta_por_qr(codigo):
    """Ruta que escaneo-carrito.js ya pedía pero nadie servía."""
    with db() as conn:
        fila = conn.execute(
            CONSULTA_HERRAMIENTA + " WHERE h.es_qr = 1 AND h.qr_codigo = %s GROUP BY h.id",
            (codigo.strip(),),
        ).fetchone()
    if fila is None:
        return jsonify({"error": "Ese código QR no está registrado en el sistema."}), 404
    return jsonify(herramienta_a_dict(fila))


@app.post("/api/herramientas")
@login_required_api
def agregar_herramienta():
    data = leer_json_objeto()
    if data is None:
        return jsonify({"error": "Se esperaba un objeto JSON"}), 400
    nombre = texto_de(data, "nombre")
    descripcion = texto_de(data, "descripcion")
    imagen = nombre_imagen_seguro(data.get("imagen", ""))
    es_qr = leer_es_qr(data)
    qr_codigo = texto_de(data, "qr_codigo") if es_qr else None
    tags = parse_tags(data)

    if es_qr is None:
        return jsonify({"error": "es_qr debe ser un valor booleano"}), 400
    if nombre is None or descripcion is None or (es_qr and qr_codigo is None):
        return jsonify({"error": "Los campos de texto deben ser cadenas"}), 400
    if len(descripcion.encode("utf-8")) > 65535:
        return jsonify({"error": "La descripción supera el tamaño máximo permitido"}), 400
    if not nombre:
        return jsonify({"error": "El nombre es obligatorio"}), 400
    if len(nombre) > 25:
        return jsonify({"error": "El nombre no puede tener más de 25 caracteres"}), 400
    if es_qr and not qr_codigo:
        return jsonify({"error": "Falta el código QR de la herramienta"}), 400
    if es_qr and len(qr_codigo) > 100:
        return jsonify({"error": "El código QR no puede superar 100 caracteres"}), 400
    if tags is None:
        return jsonify({"error": "Los tags deben ser cadenas de hasta 50 caracteres"}), 400
    if len(imagen) > 255:
        return jsonify({"error": "El nombre de la imagen supera el largo permitido"}), 400

    cantidad = 1 if es_qr else entero_en_rango(data.get("cantidad", 0))
    if cantidad is None:
        return jsonify({"error": "La cantidad debe ser un entero no negativo"}), 400

    with db() as conn:
        if es_qr:
            duplicado = conn.execute(
                "SELECT id FROM herramientas WHERE qr_codigo = %s",
                (qr_codigo,),
            ).fetchone()
            if duplicado is not None:
                return jsonify({
                    "error": "Ese código QR ya está en uso por otra herramienta"
                }), 409

        cur = conn.execute(
            "INSERT INTO herramientas (nombre, descripcion, imagen, cantidad, es_qr, qr_codigo) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (nombre, descripcion, imagen, cantidad, es_qr, qr_codigo),
        )
        herramienta_id = cur.lastrowid
        guardar_tags(conn, herramienta_id, tags)

    return jsonify({"ok": True, "id": herramienta_id}), 201


@app.put("/api/herramientas/<int:herramienta_id>")
@login_required_api
def editar_herramienta(herramienta_id):
    """
    Edita una herramienta existente: nombre, descripción, stock,
    imagen, tipo QR y tags.
    """
    data = leer_json_objeto()
    if data is None:
        return jsonify({"error": "Se esperaba un objeto JSON"}), 400
    nombre = texto_de(data, "nombre")
    descripcion = texto_de(data, "descripcion")
    imagen = nombre_imagen_seguro(data.get("imagen", ""))
    es_qr = leer_es_qr(data)
    qr_codigo = texto_de(data, "qr_codigo") if es_qr else None
    tags = parse_tags(data)

    if es_qr is None:
        return jsonify({"error": "es_qr debe ser un valor booleano"}), 400
    if nombre is None or descripcion is None or (es_qr and qr_codigo is None):
        return jsonify({"error": "Los campos de texto deben ser cadenas"}), 400
    if len(descripcion.encode("utf-8")) > 65535:
        return jsonify({"error": "La descripción supera el tamaño máximo permitido"}), 400
    if not nombre:
        return jsonify({"error": "El nombre es obligatorio"}), 400
    if len(nombre) > 25:
        return jsonify({"error": "El nombre no puede tener más de 25 caracteres"}), 400
    if es_qr and not qr_codigo:
        return jsonify({"error": "Falta el código QR de la herramienta"}), 400
    if es_qr and len(qr_codigo) > 100:
        return jsonify({"error": "El código QR no puede superar 100 caracteres"}), 400
    if tags is None:
        return jsonify({"error": "Los tags deben ser cadenas de hasta 50 caracteres"}), 400
    if len(imagen) > 255:
        return jsonify({"error": "El nombre de la imagen supera el largo permitido"}), 400

    cantidad = 1 if es_qr else entero_en_rango(data.get("cantidad", 0))
    if cantidad is None:
        return jsonify({"error": "La cantidad debe ser un entero no negativo"}), 400

    with db() as conn:
        existe = conn.execute(
            "SELECT id, es_qr, cantidad FROM herramientas WHERE id = %s FOR UPDATE",
            (herramienta_id,),
        ).fetchone()
        if existe is None:
            return jsonify({"error": "No existe esa herramienta"}), 404

        prestamos_pendientes = conn.execute(
            """SELECT COUNT(*) AS cantidad
               FROM prestamo_item pi
               JOIN prestamos p ON p.id = pi.prestamo_id
               WHERE pi.herramienta_id = %s AND p.estado = 'pendiente'""",
            (herramienta_id,),
        ).fetchone()["cantidad"]
        if prestamos_pendientes and es_qr != bool(existe["es_qr"]):
            return jsonify({
                "error": "No se puede cambiar el tipo mientras la herramienta está prestada"
            }), 409
        if es_qr and existe["es_qr"]:
            cantidad = existe["cantidad"]

        if es_qr:
            duplicado = conn.execute(
                "SELECT id FROM herramientas "
                "WHERE qr_codigo = %s AND id <> %s",
                (qr_codigo, herramienta_id),
            ).fetchone()
            if duplicado is not None:
                return jsonify({
                    "error": "Ese código QR ya está en uso por otra herramienta"
                }), 409

        conn.execute(
            "UPDATE herramientas SET nombre=%s, descripcion=%s, imagen=%s, "
            "cantidad=%s, es_qr=%s, qr_codigo=%s WHERE id=%s",
            (nombre, descripcion, imagen, cantidad, es_qr, qr_codigo, herramienta_id),
        )
        guardar_tags(conn, herramienta_id, tags)

    return jsonify({"ok": True, "id": herramienta_id})


@app.delete("/api/herramientas/<int:herramienta_id>")
@login_required_api
def borrar_herramienta(herramienta_id):
    with db() as conn:
        cur = conn.execute("DELETE FROM herramientas WHERE id = %s", (herramienta_id,))
        if cur.rowcount == 0:
            return jsonify({"error": "No existe esa herramienta"}), 404
        # Los tags se borran en cascada; los préstamos conservan el nombre
        # histórico y la referencia queda NULL por la FK ON DELETE SET NULL.

    return jsonify({"ok": True})


@app.post("/api/upload-imagen")
@login_required_api
def subir_imagen():
    archivo = request.files.get("imagen")
    if archivo is None or archivo.filename == "":
        return jsonify({"error": "No se recibió ninguna imagen"}), 400
    if not extension_permitida(archivo.filename):
        return jsonify({
            "error": "Formato no permitido. Subí una imagen PNG, JPG, GIF o WEBP"
        }), 400
    if not (archivo.mimetype or "").startswith("image/"):
        return jsonify({"error": "El archivo no parece ser una imagen"}), 400

    extension = archivo.filename.rsplit(".", 1)[1].lower()
    mime_por_extension = {
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "gif": "image/gif",
        "webp": "image/webp",
    }
    if (
        archivo.mimetype != mime_por_extension[extension]
        or not contenido_imagen_valido(archivo, extension)
    ):
        return jsonify({"error": "El contenido no coincide con el formato de imagen"}), 400
    base = (secure_filename(archivo.filename.rsplit(".", 1)[0]) or "imagen")[:100]
    nombre_final = f"{base}-{uuid.uuid4().hex}.{extension}"

    archivo.save(os.path.join(IMG_DIR, nombre_final))
    return jsonify({"ok": True, "imagen": nombre_final}), 201


# ---------------------------------------------------------------------------
# Préstamos (encargos)
# ---------------------------------------------------------------------------

@app.get("/api/prestamos")
@login_required_api
def listar_prestamos():
    estado = request.args.get("estado", "pendiente")
    if estado not in {"pendiente", "devuelto"}:
        return jsonify({"error": "Estado inválido"}), 400

    with db() as conn:
        prestamos = conn.execute(
            "SELECT * FROM prestamos WHERE estado = %s ORDER BY fecha_salida DESC",
            (estado,),
        ).fetchall()

        resultado = []
        for p in prestamos:
            items = conn.execute(
                """SELECT pi.cantidad,
                          COALESCE(pi.herramienta_nombre, h.nombre) AS nombre
                   FROM prestamo_item pi
                   LEFT JOIN herramientas h ON h.id = pi.herramienta_id
                   WHERE pi.prestamo_id = %s""",
                (p["id"],),
            ).fetchall()
            lista = ", ".join(f"{i['nombre']} (x{i['cantidad']})" for i in items)
            resultado.append({
                "id": p["id"],
                "profesor": p["profesor"],
                "alumno": p["alumno"],
                "curso": p["curso"],
                "fecha_salida": str(p["fecha_salida"]),
                "fecha_entrada": str(p["fecha_entrada"]) if p["fecha_entrada"] else None,
                "estado": p["estado"],
                "lista_herramientas": lista,
            })

    return jsonify(resultado)


@app.post("/api/prestamos")
@login_required_api
def crear_prestamo():
    data = leer_json_objeto()
    if data is None:
        return jsonify({"error": "Se esperaba un objeto JSON"}), 400
    profesor = texto_de(data, "profesor")
    alumno = texto_de(data, "alumno")
    curso = texto_de(data, "curso")
    items = data.get("items", [])

    if profesor is None or alumno is None or curso is None:
        return jsonify({"error": "Profesor, alumno y curso deben ser cadenas"}), 400
    if len(profesor) > 100 or len(alumno) > 100 or len(curso) > 50:
        return jsonify({"error": "Los datos del encargo superan el largo permitido"}), 400
    if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
        return jsonify({"error": "Los items deben ser una lista de objetos"}), 400
    if not alumno or not curso or not items:
        return jsonify({"error": "Faltan datos obligatorios"}), 400

    try:
        with db() as conn:
            # Consolidar y ordenar evita validar unidades por separado y
            # mantiene un orden estable al bloquear herramientas concurrentes.
            cantidades_por_herramienta = {}
            for item in items:
                h_id = entero_en_rango(item.get("herramienta_id"), minimo=1)
                if h_id is None:
                    return jsonify({"error": "ID de herramienta inválido"}), 400
                cant = entero_en_rango(item.get("cantidad", 1), minimo=1)
                if cant is None:
                    return jsonify({"error": f"Cantidad inválida para la herramienta ID {h_id}"}), 400
                total = cantidades_por_herramienta.get(h_id, 0) + cant
                if total > 2_147_483_647:
                    return jsonify({"error": f"Cantidad inválida para la herramienta ID {h_id}"}), 400
                cantidades_por_herramienta[h_id] = total

            # 1) Validar TODO el stock antes de escribir nada.
            items_validados = []
            for h_id, cant in sorted(cantidades_por_herramienta.items()):
                h = conn.execute(
                    "SELECT * FROM herramientas WHERE id = %s FOR UPDATE", (h_id,)
                ).fetchone()
                if h is None:
                    return jsonify({"error": f"No existe la herramienta ID {h_id}"}), 400
                if h["es_qr"]:
                    # Objeto único: se lleva de a 1 y solo si está en el pañol.
                    if cant != 1:
                        return jsonify({"error": f"'{h['nombre']}' es un objeto único: se lleva de a 1"}), 400
                    if h["cantidad"] < 1:
                        return jsonify({"error": f"'{h['nombre']}' ya está prestada"}), 400
                elif cant > h["cantidad"]:
                    return jsonify({"error": f"Stock insuficiente para {h['nombre']}"}), 400
                items_validados.append((h, cant))

            # 2) Solo si todo valida, se escribe (transaction: todo o nada).
            cur = conn.execute(
                "INSERT INTO prestamos (profesor, alumno, curso, estado) VALUES (%s, %s, %s, 'pendiente')",
                (profesor, alumno, curso),
            )
            prestamo_id = cur.lastrowid

            items_log = []
            for h, cant in items_validados:
                # UPDATE condicional: aunque dos pedidos compitan a
                # la vez, solo uno se queda con la última unidad
                # (rowcount == 0 → otro se la llevó primero).
                if h["es_qr"]:
                    cur = conn.execute(
                        "UPDATE herramientas SET cantidad = 0 "
                        "WHERE id = %s AND cantidad > 0",
                        (h["id"],),
                    )
                    if cur.rowcount == 0:
                        raise RuntimeError(
                            f"'{h['nombre']}' se prestó en el instante "
                            "justo. Actualizá la página e intentá de nuevo."
                        )
                else:
                    cur = conn.execute(
                        "UPDATE herramientas SET cantidad = cantidad - %s "
                        "WHERE id = %s AND cantidad >= %s",
                        (cant, h["id"], cant),
                    )
                    if cur.rowcount == 0:
                        raise RuntimeError(
                            f"Se acabó el stock de '{h['nombre']}' en el "
                            "instante justo. Actualizá la página e intentá de nuevo."
                        )
                conn.execute(
                    "INSERT INTO prestamo_item "
                    "(prestamo_id, herramienta_id, herramienta_nombre, cantidad) "
                    "VALUES (%s, %s, %s, %s)",
                    (prestamo_id, h["id"], h["nombre"], cant),
                )
                items_log.append((h["id"], h["nombre"], cant))

    except RuntimeError as error:
        # El rollback ya lo hizo el context manager de db().
        return jsonify({"error": str(error)}), 409

    try:
        escribir_log("SALIDA", prestamo_id, profesor, alumno, curso, items_log)
    except OSError:
        app.logger.exception("No se pudo escribir el log de salida del encargo %s", prestamo_id)
    return jsonify({"ok": True, "id": prestamo_id}), 201


@app.post("/api/prestamos/<int:prestamo_id>/devolver")
@login_required_api
def devolver_prestamo(prestamo_id):
    with db() as conn:
        prestamo = conn.execute(
            "SELECT * FROM prestamos WHERE id = %s FOR UPDATE", (prestamo_id,)
        ).fetchone()
        if prestamo is None:
            return jsonify({"error": "No existe ese encargo"}), 404
        if prestamo["estado"] != "pendiente":
            # Evita devolver dos veces (doble clic o dos
            # pestañas): el stock se repondría dos veces.
            return jsonify({"error": "Ese encargo ya fue devuelto"}), 409

        items = conn.execute(
            "SELECT * FROM prestamo_item WHERE prestamo_id = %s", (prestamo_id,)
        ).fetchall()

        items_log = []
        for item in items:
            h = conn.execute(
                "SELECT * FROM herramientas WHERE id = %s", (item["herramienta_id"],)
            ).fetchone()
            if h is not None:
                if h["es_qr"]:
                    # Objeto único: vuelve a estar disponible en el pañol.
                    conn.execute(
                        "UPDATE herramientas SET cantidad = 1 WHERE id = %s",
                        (h["id"],),
                    )
                else:
                    conn.execute(
                        "UPDATE herramientas SET cantidad = cantidad + %s WHERE id = %s",
                        (item["cantidad"], h["id"]),
                    )
            items_log.append((
                item["herramienta_id"],
                item["herramienta_nombre"],
                item["cantidad"],
            ))

        conn.execute(
            "UPDATE prestamos SET estado = 'devuelto', fecha_entrada = NOW() WHERE id = %s",
            (prestamo_id,),
        )

    try:
        escribir_log("ENTRADA", prestamo_id, prestamo["profesor"], prestamo["alumno"],
                     prestamo["curso"], items_log)
    except OSError:
        app.logger.exception("No se pudo escribir el log de devolución del encargo %s", prestamo_id)
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Movimientos (log CSV diario)
# ---------------------------------------------------------------------------

@app.get("/api/movimientos")
@login_required_api
def listar_movimientos_hoy():
    ruta = ruta_registro_hoy()
    if not os.path.exists(ruta):
        return jsonify({"fecha": datetime.date.today().isoformat(), "lineas": []})
    with open(ruta, "r", encoding="utf-8-sig") as f:
        lineas = [linea.rstrip("\n") for linea in f.readlines() if linea.strip()]
    return jsonify({"fecha": datetime.date.today().isoformat(), "lineas": lineas})


@app.post("/api/movimientos")
def movimientos_legacy():
    """El POST a /api/movimientos quedó deprecado (lo reemplazó /api/prestamos)."""
    return jsonify({"error": "Endpoint retirado. Usá POST /api/prestamos."}), 410


@app.get("/api/movimientos/descargar")
@login_required_api
def descargar_movimientos_hoy():
    ruta = ruta_registro_hoy()
    if not os.path.exists(ruta):
        return jsonify({"error": "Todavía no hay movimientos registrados hoy."}), 404
    return send_file(
        ruta,
        as_attachment=True,
        download_name=f"registro-{datetime.date.today().isoformat()}.csv",
        mimetype="text/csv",
    )


@app.get("/api/movimientos/descargar-anual")
@login_required_api
def descargar_movimientos_anual():
    """ZIP con todos los registros diarios del año en curso."""
    anio = datetime.date.today().strftime("%Y")
    registros = sorted(
        nombre
        for nombre in os.listdir(REGISTROS_DIR)
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}\.csv", nombre)
        and nombre.startswith(anio)
    )
    if not registros:
        return jsonify({"error": "Todavía no hay registros este año."}), 404

    memoria = io.BytesIO()
    with zipfile.ZipFile(memoria, "w", zipfile.ZIP_DEFLATED) as zf:
        for nombre in registros:
            zf.write(os.path.join(REGISTROS_DIR, nombre), nombre)
    memoria.seek(0)
    return send_file(
        memoria,
        as_attachment=True,
        download_name=f"registro-{anio}.zip",
        mimetype="application/zip",
    )


# ---------------------------------------------------------------------------
# Notas (bloc compartido, una sola fila id=1)
# ---------------------------------------------------------------------------

@app.get("/api/notas")
@login_required_api
def obtener_nota():
    with db() as conn:
        fila = conn.execute(
            "SELECT texto, fecha_actualizacion FROM notas WHERE id = 1"
        ).fetchone()
    if fila is None:
        return jsonify({"texto": "", "fecha_actualizacion": None})
    return jsonify({
        "texto": fila["texto"],
        "fecha_actualizacion": str(fila["fecha_actualizacion"]),
    })


@app.put("/api/notas")
@login_required_api
def guardar_nota():
    data = leer_json_objeto()
    if data is None:
        return jsonify({"error": "Se esperaba un objeto JSON"}), 400
    texto = data.get("texto", "")
    if not isinstance(texto, str):
        return jsonify({"error": "El texto de la nota debe ser una cadena"}), 400
    if len(texto.encode("utf-8")) > 65535:
        return jsonify({"error": "La nota supera el tamaño máximo permitido"}), 400
    with db() as conn:
        fila = conn.execute("SELECT id FROM notas WHERE id = 1").fetchone()
        if fila is None:
            return jsonify({"error": "No se encontró la nota para actualizar"}), 500
        conn.execute(
            "UPDATE notas SET texto = %s WHERE id = 1", (texto,)
        )
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Servidor de desarrollo (producción: gunicorn, ver README.md)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
