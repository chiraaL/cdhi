
// notas.js — Bloc de notas compartido (una sola fila, id=1).
//
// - Lee y escribe la API Flask /api/notas.
// - credentials: "same-origin": guardar nota requiere sesión.

function formatearFechaNota(fechaISO) {
    if (!fechaISO) return "";
    // MySQL devuelve la hora local del servidor: se interpreta
    // como hora local. Sin el ".replace + Z" de antes, que la
    // tomaba como UTC y la mostraba desfasada (ej. 3 hs).
    const fecha = new Date(fechaISO.replace(" ", "T"));
    if (Number.isNaN(fecha.getTime())) return "";
    return fecha.toLocaleString();
}

async function cargarNota() {
    const $texto = document.getElementById("notas-texto");
    const $estado = document.getElementById("notas-estado");
    if (!$texto) return;

    try {
        const res = await fetch("/api/notas", { credentials: "same-origin" });
        if (!res.ok) throw new Error("Error al cargar");
        const data = await res.json();
        $texto.value = data.texto || "";
        if ($estado && data.fecha_actualizacion) {
            $estado.textContent = `Última actualización: ${formatearFechaNota(data.fecha_actualizacion)}`;
        }
    } catch (error) {
        if ($estado) $estado.textContent = "No se pudo cargar la nota guardada.";
    }
}

async function guardarNota() {
    const $texto = document.getElementById("notas-texto");
    const $estado = document.getElementById("notas-estado");
    const $btn = document.getElementById("btn-guardar-nota");
    if (!$texto) return;

    if ($btn) $btn.disabled = true;

    try {
        const res = await fetch("/api/notas", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ texto: $texto.value }),
        });
        const data = await res.json();

        if (!res.ok) {
            mostrarAlerta(data.error || "No se pudo guardar la nota", "error");
            return;
        }

        mostrarAlerta("Nota guardada.", "exito");
        if ($estado) $estado.textContent = `Última actualización: ${new Date().toLocaleString()}`;
    } catch (error) {
        mostrarAlerta("No se pudo conectar con el servidor.", "error");
    } finally {
        if ($btn) $btn.disabled = false;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    cargarNota();

    const $btnGuardar = document.getElementById("btn-guardar-nota");
    if ($btnGuardar) $btnGuardar.addEventListener("click", guardarNota);
});
