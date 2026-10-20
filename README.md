# C.D.H.I. — Control Digitalizado de Herramientas e Insumos

Sistema web para el inventario del pañol de una escuela técnica: catálogo de
herramientas con stock, registro de encargos (salidas/devoluciones), escaneo de
códigos QR, bloc de notas compartido y log diario descargable.

- **Backend:** Python 3 + Flask (API REST + páginas Jinja2)
- **Base de datos:** MySQL 8 / MariaDB (InnoDB, utf8mb4)
- **Frontend:** HTML/CSS/JS vanilla (sin build, sin frameworks)
- **Producción:** Gunicorn (systemd) + Apache 2 (Reverse Proxy) + HTTPS (Certbot)

---

## Estructura del proyecto

```
cdhi/                          ← esta carpeta completa es la app
├── app.py                  # Backend: rutas de páginas + API completa
├── config.py               # Configuración desde variables de entorno
├── db.py                   # Conexiones MySQL con transacciones
├── init_db.py              # Crea la base y el esquema
├── crear_usuario.py        # Alta de usuarios desde terminal
├── requirements.txt
├── .env.example            # Plantilla de configuración
├── templates/              # Páginas HTML (Jinja2)
├── static/                 # css/ js/ img/  (estáticos e imágenes subidas)
└── registros/              # Log diario de movimientos (se crea solo)
```

---

## 1. Instalación local (PC de desarrollo)

### Requisitos previos

- **Python 3.10+** → <https://www.python.org/downloads/>
- **MySQL 8.0+** → <https://dev.mysql.com/downloads/mysql/> (o XAMPP/MAMP con MySQL)

### Paso 1 — Copiar el proyecto y crear el entorno virtual

Copiá **toda la carpeta** del proyecto a tu computadora y abrí una
terminal en ella:

```bash
python -m venv venv
```

Activá el entorno:

- Windows (PowerShell): `.\venv\Scripts\Activate.ps1`
- Windows (CMD): `venv\Scripts\activate.bat`
- Linux/macOS: `source venv/bin/activate`

### Paso 2 — Instalar dependencias

```bash
pip install -r requirements.txt
```

### Paso 3 — Crear la base de datos y el usuario MySQL

Entrá a MySQL como root (`mysql -u root -p`) y ejecutá:

```sql
CREATE DATABASE cdhi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'cdhi'@'localhost' IDENTIFIED BY 'una-contraseña-fuerte';
GRANT ALL PRIVILEGES ON cdhi.* TO 'cdhi'@'localhost';
FLUSH PRIVILEGES;
```

### Paso 4 — Configurar `.env`

```bash
cp .env.example .env
```

Editá `.env`:

```dotenv
SECRET_KEY=pegá-acá-una-clave-generada
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=cdhi
MYSQL_PASSWORD=una-contraseña-fuerte
MYSQL_DB=cdhi
```

Generá la `SECRET_KEY` con:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### Paso 5 — Crear el esquema y el primer usuario

```bash
python init_db.py
python crear_usuario.py
```

### Paso 6 — Levantar el servidor de desarrollo

```bash
python app.py
```

Abrí <http://127.0.0.1:5000> → redirige a `/login`. Iniciá sesión con el
usuario que creaste en el Paso 5.

> ⚠️ El servidor de Flask (`app.run`) es solo para desarrollo. Para producción
> usá Gunicorn (sección 2).

### Variables de entorno

| Variable       | Descripción                                  | Ejemplo            |
|----------------|----------------------------------------------|--------------------|
| `SECRET_KEY`   | Clave para firmar cookies de sesión          | `secrets.token_hex(32)` |
| `MYSQL_HOST`   | Host de MySQL                                | `127.0.0.1`        |
| `MYSQL_PORT`   | Puerto de MySQL                              | `3306`             |
| `MYSQL_USER`   | Usuario de la app (sin privilegios de DDL en producción) | `cdhi` |
| `MYSQL_PASSWORD` | Contraseña del usuario                     | —                  |
| `MYSQL_DB`     | Nombre de la base                            | `cdhi`             |
| `PORT`         | Puerto de desarrollo (solo `python app.py`)  | `5000`             |
| `SESSION_COOKIE_SECURE` | Enviar la cookie solo por HTTPS (`1` en producción) | `0` local |

---

## 2. Despliegue en Producción (Debian 12 Bare-Metal sin Virtualmin)

Este despliegue está diseñado para un **servidor Debian 12 limpio (fresh install)** con **2 GB RAM / 2 vCPU**, sin paneles de control. Usa **Gunicorn como servicio systemd** y **Apache 2 como Reverse Proxy** con **Certbot (Let's Encrypt)** para HTTPS.

> **Arquitectura:**  
> `Cliente (HTTPS :443)` → `Apache 2 (:80/:443)` → `ProxyPass` → `Gunicorn (127.0.0.1:5000)` → `Flask App` → `MariaDB (localhost:3306)`

### Prerrequisitos del servidor

- VPS / Bare-metal con **Debian 12 (Bookworm)** instalado.
- Dominio o subdominio apuntando a la IP pública del servidor (ej. `panol.escuela.edu.ar`).
- Acceso **root** por SSH.
- Puertos **80** y **443** abiertos en el firewall del proveedor (cloud panel).

---

### Paso 1 — Preparación del sistema Debian 12

Actualizá el sistema e instalá los paquetes base:

```bash
apt update && apt upgrade -y
apt install -y \
    python3 python3-venv python3-pip \
    apache2 mariadb-server \
    git ufw certbot python3-certbot-apache \
    curl wget htop vim
```

Verificá versiones críticas:

```bash
python3 --version      # ≥ 3.11
apache2 -v             # Apache/2.4.57+
mariadb --version      # 10.11+
```

---

### Paso 2 — Optimización de Recursos (2 GB RAM)

En servidores con 2 GB de RAM es **altamente recomendable** crear **swap** para evitar que el OOM Killer mate procesos (Gunicorn, MariaDB, Apache) bajo carga.

**Opción A — Archivo de swap de 2 GB (recomendado para 2 GB RAM):**

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

**Opción B — Archivo de swap de 1 GB (mínimo):**

```bash
fallocate -l 1G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

**Ajuste de *swappiness* (opcional, para priorizar RAM):**

```bash
echo 'vm.swappiness=10' >> /etc/sysctl.d/99-swappiness.conf
sysctl --system
```

Verificá:

```bash
free -h
swapon --show
```

---

### Paso 3 — Base de Datos MariaDB/MySQL

#### 3.1 Hardening inicial

```bash
mysql_secure_installation
```

Respuestas sugeridas:
- Switch to unix_socket authentication? **Y** (root usa auth_socket)
- Change root password? **Y** (establecé una contraseña fuerte para root)
- Remove anonymous users? **Y**
- Disallow root login remotely? **Y**
- Remove test database? **Y**
- Reload privilege tables? **Y**

#### 3.2 Creación de la base y usuario de la app (privilegios mínimos)

```bash
mysql -u root -p
```

```sql
CREATE DATABASE cdhi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Usuario de la app: SOLO DML (SELECT, INSERT, UPDATE, DELETE)
CREATE USER 'cdhi'@'localhost' IDENTIFIED BY 'CONTRASEÑA_MUY_FUERTE_AQUI';
GRANT SELECT, INSERT, UPDATE, DELETE ON cdhi.* TO 'cdhi'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> **Nota:** El esquema (`init_db.py`) requiere `CREATE`/`ALTER`. Ejecutalo **una sola vez** con usuario `root` (ver Paso 4.5). Después la app corre con el usuario limitado `cdhi`.

---

### Paso 4 — Usuario del sistema y despliegue del código

#### 4.1 Crear usuario del sistema (sin login interactivo)

```bash
adduser --system --group --home /var/www/cdhi --shell /bin/bash cdhi
```

#### 4.2 Desplegar el proyecto en `/var/www/cdhi`

**Opción A — Desde Git (recomendado):**

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/TU_USUARIO/cdhi.git
chown -R cdhi:www-data /var/www/cdhi
```

**Opción B — Copia manual (SFTP/SCP/rsync):**

```bash
mkdir -p /var/www
# Copiá TODA la carpeta del proyecto a /var/www/cdhi
chown -R cdhi:www-data /var/www/cdhi
```

#### 4.3 Entorno virtual e instalación de dependencias

```bash
sudo -u cdhi -H bash -c "
cd /var/www/cdhi
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
"
```

#### 4.4 Permisos de directorios de datos (escritura en runtime)

```bash
mkdir -p /var/www/cdhi/registros /var/www/cdhi/static/img
chown -R cdhi:www-data /var/www/cdhi/registros /var/www/cdhi/static/img
chmod 775 /var/www/cdhi/registros /var/www/cdhi/static/img
```

#### 4.5 Inicializar el esquema de la base de datos (una sola vez)

```bash
sudo -u cdhi -H bash -c "
cd /var/www/cdhi
source .venv/bin/activate
# Usamos root de MySQL para crear tablas (tiene privilegio CREATE)
MYSQL_PWD='TU_ROOT_MYSQL_PASSWORD' mysql -u root cdhi < /dev/null 2>/dev/null || true
python init_db.py
"
```

> Si preferís no usar root en el script, creá un usuario admin temporal con `GRANT CREATE, ALTER, INDEX, REFERENCES ON cdhi.* TO 'cdhi_admin'@'localhost' IDENTIFIED BY '...';`, ejecutá `init_db.py` con ese usuario y luego revocá los privilegios DDL.

---

### Paso 5 — Configuración de variables `.env` de producción

```bash
sudo -u cdhi -H bash -c "
cd /var/www/cdhi
cp .env.example .env
"
```

Editá `/var/www/cdhi/.env`:

```dotenv
SECRET_KEY=<generada_con_secrets.token_hex(32)>
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=cdhi
MYSQL_PASSWORD=CONTRASEÑA_MUY_FUERTE_AQUI
MYSQL_DB=cdhi
SESSION_COOKIE_SECURE=1
```

Generá la `SECRET_KEY`:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

Creá el primer usuario web y asegurá permisos:

```bash
sudo -u cdhi -H bash -c "
cd /var/www/cdhi
source .venv/bin/activate
python crear_usuario.py
chmod 600 .env
"
```

---

### Paso 6 — Servicio Systemd con Gunicorn

Calculá workers óptimos para **2 vCPU / 2 GB RAM**:

- Fórmula clásica: `(2 * núcleos) + 1 = 5` → **demasiado pesado** para 2 GB.
- **Recomendado:** **2 o 3 workers** *sync* + hilos, o **2 workers** *gthread*.

**Archivo `/etc/systemd/system/cdhi.service`:**

```ini
[Unit]
Description=C.D.H.I. — Flask + MariaDB (Gunicorn)
Documentation=https://github.com/TU_USUARIO/cdhi
After=network.target mariadb.service
Wants=mariadb.service

[Service]
Type=notify
User=cdhi
Group=www-data
WorkingDirectory=/var/www/cdhi
EnvironmentFile=/var/www/cdhi/.env
# Opción A: 3 workers sync (simple, ~150-200 MB c/u = ~450-600 MB total)
ExecStart=/var/www/cdhi/.venv/bin/gunicorn \
    --workers 3 \
    --bind 127.0.0.1:5000 \
    --timeout 60 \
    --access-logfile - \
    --error-logfile - \
    app:app

# Opción B (alternativa): 2 workers gthread (mejor concurrencia I/O, menor RAM)
# ExecStart=/var/www/cdhi/.venv/bin/gunicorn \
#     --workers 2 \
#     --threads 4 \
#     --worker-class gthread \
#     --bind 127.0.0.1:5000 \
#     --timeout 60 \
#     --access-logfile - \
#     --error-logfile - \
#     app:app

Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=cdhi

# Hardening
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/www/cdhi/registros /var/www/cdhi/static/img

[Install]
WantedBy=multi-user.target
```

Activá y arrancá:

```bash
systemctl daemon-reload
systemctl enable --now cdhi
systemctl status cdhi          # debe mostrar "active (running)"
journalctl -u cdhi -f          # logs en vivo
```

**Verificación local:**

```bash
curl -s http://127.0.0.1:5000/api/check-session
# Respuesta esperada: {"logueado":false}
```

---

### Paso 7 — Apache 2 como Proxy Inverso

#### 7.1 Habilitar módulos necesarios

```bash
a2enmod proxy proxy_http rewrite headers ssl
systemctl restart apache2
```

#### 7.2 Crear VirtualHost `/etc/apache2/sites-available/cdhi.conf`

```apache
<VirtualHost *:80>
    ServerName panol.escuela.edu.ar
    ServerAlias www.panol.escuela.edu.ar

    # Redirigir TODO a HTTPS (Certbot lo hará automático, pero esto es fallback)
    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [L,R=301]
</VirtualHost>

<VirtualHost *:443>
    ServerName panol.escuela.edu.ar
    ServerAlias www.panol.escuela.edu.ar

    # Certificados los gestiona Certbot (se inyectan abajo)
    # SSLEngine on
    # SSLCertificateFile ...
    # SSLCertificateKeyFile ...

    # Seguridad TLS (opcional pero recomendado)
    Protocols h2 http/1.1
    SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1
    SSLCipherSuite HIGH:!aNULL:!MD5:!3DES
    SSLHonorCipherOrder on

    # Cabeceras de seguridad
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    Header always set Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'"

    # Servir estáticos DIRECTAMENTE desde Apache (alto rendimiento, descarga Gunicorn)
    Alias /static /var/www/cdhi/static
    <Directory /var/www/cdhi/static>
        Require all granted
        Options -Indexes
        # Cache estático agresivo (1 año)
        <IfModule mod_expires.c>
            ExpiresActive On
            ExpiresDefault "access plus 1 year"
        </IfModule>
    </Directory>

    # Logs dedicados
    ErrorLog ${APACHE_LOG_DIR}/cdhi-error.log
    CustomLog ${APACHE_LOG_DIR}/cdhi-access.log combined

    # Proxy hacia Gunicorn (todo lo que NO sea /static)
    ProxyPreserveHost On
    ProxyPass /static !
    ProxyPass / http://127.0.0.1:5000/
    ProxyPassReverse / http://127.0.0.1:5000/

    # WebSocket upgrade (si en el futuro usás sockets)
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} websocket [NC]
    RewriteCond %{HTTP:Connection} upgrade [NC]
    RewriteRule ^/?(.*) "ws://127.0.0.1:5000/$1" [P,L]
</VirtualHost>
```

#### 7.3 Habilitar sitio y recargar Apache

```bash
a2dissite 000-default.conf   # deshabilitar sitio por defecto
a2ensite cdhi.conf
apache2ctl configtest        # Syntax OK
systemctl reload apache2
```

---

### Paso 8 — Certificado SSL/HTTPS (Certbot)

Obtené el certificado y configurá la renovación automática:

```bash
certbot --apache -d panol.escuela.edu.ar -d www.panol.escuela.edu.ar \
    --redirect --hsts --staple-ocsp --must-staple \
    --email admin@escuela.edu.ar --agree-tos --no-eff-email
```

- `--redirect`: HTTP → 301 HTTPS automático.
- `--hsts`: Header Strict-Transport-Security.
- `--staple-ocsp --must-staple`: OCSP Stapling.

**Verificar renovación automática:**

```bash
systemctl status certbot.timer
# o en cron (timer systemd está activo por defecto en Debian 12)
certbot renew --dry-run
```

---

### Paso 9 — Cortafuegos (UFW)

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status verbose
```

> **Importante:** El puerto **5000 (Gunicorn) NO se expone**. Solo escucha en `127.0.0.1`.

---

### Paso 10 — Backups y Mantenimiento Automatizado

#### 10.1 Script de backup `/usr/local/bin/backup-cdhi.sh`

```bash
cat > /usr/local/bin/backup-cdhi.sh << 'EOF'
#!/bin/bash
set -euo pipefail

# Configuración
DB_NAME="cdhi"
DB_USER="cdhi"
DB_PASS="CONTRASEÑA_MUY_FUERTE_AQUI"   # O leé de /var/www/cdhi/.env
BACKUP_DIR="/var/backups/cdhi"
DATE=$(date +%F_%H-%M)
RETENTION_DAYS=30

# Directorios a respaldar
APP_DIR="/var/www/cdhi"
DATA_DIRS=(
    "${APP_DIR}/static/img"
    "${APP_DIR}/registros"
)

mkdir -p "${BACKUP_DIR}"

# 1. Dump de base de datos (comprimido)
mysqldump --single-transaction --quick --lock-tables=false \
    -u "${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" \
    | gzip > "${BACKUP_DIR}/cdhi-db-${DATE}.sql.gz"

# 2. Archivos de datos (imágenes + logs)
tar -czf "${BACKUP_DIR}/cdhi-files-${DATE}.tar.gz" \
    -C "${APP_DIR}" static/img registros 2>/dev/null || true

# 3. Limpieza de backups antiguos
find "${BACKUP_DIR}" -type f -name "cdhi-*-${DATE}*" -mtime +${RETENTION_DAYS} -delete

echo "[$(date)] Backup completado: ${BACKUP_DIR}"
EOF

chmod 750 /usr/local/bin/backup-cdhi.sh
chown root:root /usr/local/bin/backup-cdhi.sh
mkdir -p /var/backups/cdhi
chmod 750 /var/backups/cdhi
```

#### 10.2 Programar en cron (diario a las 02:30 AM)

```bash
# Editar crontab de root
crontab -e
```

Añadir:

```cron
# Backup C.D.H.I. diario a las 02:30
30 2 * * * /usr/local/bin/backup-cdhi.sh >> /var/log/cdhi-backup.log 2>&1
```

#### 10.3 Logrotate para logs de la app y Apache

```bash
cat > /etc/logrotate.d/cdhi << 'EOF'
/var/www/cdhi/registros/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 640 cdhi www-data
    sharedscripts
    postrotate
        systemctl reload cdhi > /dev/null 2>&1 || true
    endscript
}

/var/log/apache2/cdhi-*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 640 root adm
    sharedscripts
    postrotate
        systemctl reload apache2 > /dev/null 2>&1 || true
    endscript
}
EOF
```

---

### Actualizar la app en producción

```bash
cd /var/www/cdhi
# 1. Traer cambios (git pull / scp / rsync)
git pull origin main

# 2. (Opcional) Actualizar dependencias si changed requirements.txt
sudo -u cdhi -H bash -c "
    source .venv/bin/activate
    pip install -r requirements.txt
"

# 3. Reiniciar servicio
sudo systemctl restart cdhi

# 4. Verificar
curl -s http://127.0.0.1:5000/api/check-session
```

> **No toques** `static/img/` (imágenes subidas), `registros/` ni `.env` al actualizar: son **datos**, no código.

---

### Tabla de diagnóstico rápido

| Síntoma | Qué revisar / Comando |
|---|---|
| `502 Bad Gateway` | `systemctl status cdhi` → ¿Gunicorn activo? `journalctl -u cdhi -n 50` |
| `500 Internal Server` | `journalctl -u cdhi -f` → traceback Python; revisar `.env` y conectividad MySQL |
| Error conexión MySQL | Credenciales en `.env`; `mysql -u cdhi -p -e "SELECT 1"` |
| Imágenes no aparecen | `ls -la /var/www/cdhi/static/img/`; `chown -R cdhi:www-data /var/www/cdhi/static/img` |
| Cambios no se ven | `Ctrl+Shift+R` (cache navegador); `systemctl reload apache2` |
| OOM Killer mata procesos | `dmesg -T | grep -i oom`; aumentar swap o bajar workers |
| Certificado expirado | `certbot renew --dry-run`; `systemctl status certbot.timer` |

---

### Checklist de seguridad (Producción)

- [ ] `SECRET_KEY` única, larga, generada con `secrets.token_hex(32)` (nunca la de ejemplo)
- [ ] Usuario MySQL de la app **SIN** privilegios DDL (`CREATE`, `ALTER`, `DROP`, `GRANT`)
- [ ] HTTPS obligatorio con **Certbot** (HSTS, OCSP Stapling, redirección 301)
- [ ] `.env` con permisos `600`, owner `cdhi:www-data`, **fuera de git** (`.gitignore`)
- [ ] Gunicorn escuchando **solo en `127.0.0.1:5000`** (nunca `0.0.0.0`)
- [ ] Apache sirviendo `/static` directamente (descarga Gunicorn, headers de cache)
- [ ] **UFW** activo: solo `22` (SSH), `80`, `443` expuestos
- [ ] `systemd` hardening: `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`, `ReadWritePaths` mínimos
- [ ] Backups automatizados diarios (DB + `static/img` + `registros/`) con retención ≥ 30 días
- [ ] `logrotate` configurado para logs de app y Apache
- [ ] `mysql_secure_installation` ejecutado (root remote deshabilitado, test DB removida)
- [ ] Monitoreo básico: `systemctl status cdhi mariadb apache2` en cron o herramienta externa

---

## Licencia

Uso interno educativo. Adaptá según tus necesidades.