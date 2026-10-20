
// Todo lo relacionado a escanear QR vive acá. Se usa desde
// gestionar-herramientas.js (para registrar el código de una herramienta
// nueva) y desde escaneo-carrito.js (para agregar al carrito desde index).
//
// El escaneo con cámara solo tiene sentido en el celular: en una PC de
// escritorio no hay forma práctica de acercar un QR a la cámara, así que
// las pantallas ni siquiera muestran los botones si esMovil() da false.

function esMovil() {
    const uaMovil = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent);
    const punteroTosco = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    return uaMovil || punteroTosco;
}
window.esMovil = esMovil;

let _qrInstancia = null;
let _qrModal = null;

function crearModalQR() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const caja = document.createElement("div");
    caja.className = "modal-caja";

    const btnCerrar = document.createElement("button");
    btnCerrar.type = "button";
    btnCerrar.className = "modal-cerrar";
    btnCerrar.textContent = "×";
    btnCerrar.setAttribute("aria-label", "Cerrar");
    btnCerrar.addEventListener("click", () => cerrarEscaneoQR());

    const titulo = document.createElement("h2");
    titulo.className = "modal-titulo";
    titulo.textContent = "Escaneá el código QR";

    const texto = document.createElement("p");
    texto.className = "modal-texto";
    texto.textContent = "Apuntá la cámara al código QR pegado en la herramienta.";

    const lector = document.createElement("div");
    lector.id = "qr-reader-zona";
    lector.className = "qr-reader-zona";

    caja.append(btnCerrar, titulo, texto, lector);
    overlay.appendChild(caja);

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) cerrarEscaneoQR();
    });

    document.body.appendChild(overlay);
    _qrModal = overlay;
    return overlay;
}

async function abrirEscaneoQR(onCodigoDetectado) {
    if (!esMovil()) {
        mostrarAlerta("Escanear QR solo está disponible desde el celular.", "error");
        return;
    }

    if (typeof Html5Qrcode === "undefined") {
        mostrarAlerta("No se pudo cargar el lector de QR. Revisá tu conexión a internet.", "error");
        return;
    }

    const overlay = _qrModal || crearModalQR();

    document.body.classList.add("modal-abierto");
    void overlay.offsetHeight;
    requestAnimationFrame(() => overlay.classList.add("visible"));

    _qrInstancia = new Html5Qrcode("qr-reader-zona");

    try {
        await _qrInstancia.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: 240 },
            (textoDecodificado) => {
                onCodigoDetectado(textoDecodificado);
                cerrarEscaneoQR();
            },
            () => {
                // se dispara todo el tiempo mientras no detecta nada, se ignora
            }
        );
    } catch (error) {
        mostrarAlerta("No se pudo acceder a la cámara. Revisá los permisos del navegador.", "error");
        cerrarEscaneoQR();
    }
}
window.abrirEscaneoQR = abrirEscaneoQR;

function cerrarEscaneoQR() {
    const instancia = _qrInstancia;
    _qrInstancia = null;

    if (instancia) {
        instancia
            .stop()
            .then(() => instancia.clear())
            .catch(() => {});
    }

    if (_qrModal) {
        _qrModal.classList.remove("visible");
        document.body.classList.remove("modal-abierto");
    }
}
window.cerrarEscaneoQR = cerrarEscaneoQR;
