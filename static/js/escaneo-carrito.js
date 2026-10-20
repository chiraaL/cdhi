
// escaneo-carrito.js — Botón flotante "📷 Escanear QR" (solo móvil)
// que busca una herramienta por su código QR (GET
// /api/herramientas/por-qr/<codigo>) y la agrega al carrito.
//
// credentials: "same-origin" por consistencia con el resto.

async function buscarYAgregarPorQR(codigo) {
    try {
        const res = await fetch(
            `/api/herramientas/por-qr/${encodeURIComponent(codigo)}`,
            { credentials: "same-origin" }
        );

        if (res.status === 404) {
            mostrarAlerta("Ese código QR no está registrado en el sistema.", "error");
            return;
        }
        if (!res.ok) {
            mostrarAlerta("No se pudo buscar la herramienta escaneada.", "error");
            return;
        }

        const herramienta = await res.json();

        // No agregar al carrito lo que no está disponible:
        // objeto único ya prestado, o stock en cero.
        if (herramienta.cantidad < 1) {
            mostrarAlerta(
                herramienta.es_qr
                    ? `${herramienta.nombre} ya está prestada.`
                    : `${herramienta.nombre} no tiene stock.`,
                "error"
            );
            return;
        }

        // Refrescamos la caché local con el dato recién leído (por si el
        // stock cambió desde la última vez que se cargó la grilla).
        if (typeof herramientasCache !== "undefined") {
            const indice = herramientasCache.findIndex((item) => item.id === herramienta.id);
            if (indice >= 0) {
                herramientasCache[indice] = herramienta;
            } else {
                herramientasCache.push(herramienta);
            }
        }

        if (typeof agregarAlCarrito === "function") {
            agregarAlCarrito(herramienta.id, herramienta.nombre, herramienta.es_qr);
            mostrarAlerta(`${herramienta.nombre} agregada al carrito.`, "exito");
        }
    } catch (error) {
        mostrarAlerta("No se pudo conectar con el servidor.", "error");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    if (typeof esMovil !== "function" || !esMovil()) return;

    const boton = document.createElement("button");
    boton.type = "button";
    boton.id = "btn-escanear-carrito";
    boton.className = "btn-escanear-qr";
    boton.textContent = "📷 Escanear QR";
    boton.addEventListener("click", () => {
        abrirEscaneoQR(buscarYAgregarPorQR);
    });

    document.body.appendChild(boton);
});
