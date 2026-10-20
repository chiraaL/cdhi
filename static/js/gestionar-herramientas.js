
// gestionar-herramientas.js — ABM del catálogo.
//
// Notas de implementación:
//  1. Todos los fetch van a la API Flask (/api/herramientas).
//  2. Crear = POST /api/herramientas. Editar = PUT
//     /api/herramientas/<id> (según si hay editandoId).
//  3. Subida de imágenes: vista previa local inmediata +
//     POST /api/upload-imagen (guarda en static/img/ con
//     nombre único y devuelve el nombre final).
//  4. Las rutas de imagen usan window.APP.staticUrl.
//  5. La API devuelve tags como array.

let editandoId = null;
let herramientasAdminCache = [];

let imagenActual = "martillo.png";

let tipoActual = "sin-qr";
let qrCodigoActual = null;
let cantidadOriginalEdicion = 0;

const $nombre = document.getElementById("h-nombre");
const $descripcion = document.getElementById("h-descripcion");
const $cantidad = document.getElementById("h-cantidad");
const $labelCantidad = document.getElementById("label-cantidad");
const $imagenInput = document.getElementById("h-imagen-input");
const $imagenPreview = document.getElementById("imagen-preview");
const $imagenEstado = document.getElementById("imagen-estado");
const $btnElegirImagen = document.getElementById("btn-elegir-imagen");
const $tags = document.getElementById("h-tags");
const $btnGuardar = document.getElementById("btn-guardar");
const $btnCancelar = document.getElementById("btn-cancelar-edicion");
const $titulo = document.getElementById("titulo-form");
const $lista = document.getElementById("lista-admin-herramientas");

const $tipoToggle = document.getElementById("tipo-herramienta-toggle");
const $btnTipoSinQR = document.getElementById("btn-tipo-sin-qr");
const $btnTipoConQR = document.getElementById("btn-tipo-con-qr");
const $seccionQR = document.getElementById("seccion-qr");
const $btnEscanearRegistro = document.getElementById("btn-escanear-registro");
const $infoQREstado = document.getElementById("info-qr-estado");

function actualizarVisibilidadTipo() {
    const movil = typeof esMovil === "function" && esMovil();

    // "block" y no "": la clase .solo-movil tiene display:none
    // en el CSS, así que hay que pisarla con un inline explícito.
    if ($tipoToggle) $tipoToggle.style.display = movil ? "block" : "none";

    if (!movil && !editandoId) {
        tipoActual = "sin-qr";
    }

    const esConQR = tipoActual === "con-qr";

    if ($seccionQR) $seccionQR.style.display = (movil && esConQR) ? "" : "none";
    if ($cantidad) $cantidad.style.display = esConQR ? "none" : "";
    if ($labelCantidad) $labelCantidad.style.display = esConQR ? "none" : "";

    if (esConQR && $infoQREstado) {
        const estadoTxt = cantidadOriginalEdicion > 0 || !editandoId ? "Disponible" : "Prestada";
        $infoQREstado.style.display = "";
        $infoQREstado.textContent = qrCodigoActual
            ? `Objeto único — Estado: ${estadoTxt} — Código QR: ${qrCodigoActual}`
            : "Objeto único — todavía no escaneaste el código QR.";
    } else if ($infoQREstado) {
        $infoQREstado.style.display = "none";
    }
}

function cambiarTipo(tipo) {
    tipoActual = tipo;
    if ($btnTipoSinQR) $btnTipoSinQR.classList.toggle("activo", tipo === "sin-qr");
    if ($btnTipoConQR) $btnTipoConQR.classList.toggle("activo", tipo === "con-qr");
    actualizarVisibilidadTipo();
}

async function cargarLista() {
    try {
        const res = await fetch("/api/herramientas", { credentials: "same-origin" });
        if (!res.ok) throw new Error("Error al cargar");
        const datosBD = await res.json();

        herramientasAdminCache = datosBD.map((h) => ({
            ...h,
            id: parseInt(h.id),
            cantidad: parseInt(h.cantidad),
            es_qr: !!h.es_qr,
            tags: Array.isArray(h.tags) ? h.tags : [],
        }));

        renderLista();
    } catch (error) {
        $lista.innerHTML = '<li class="sin-movimientos">No se pudieron cargar las herramientas.</li>';
    }
}

function renderLista() {
    if (herramientasAdminCache.length === 0) {
        $lista.innerHTML = '<li class="sin-movimientos">Todavía no hay herramientas cargadas.</li>';
        return;
    }

    $lista.innerHTML = "";
    herramientasAdminCache.forEach((h) => {
        const li = document.createElement("li");
        li.className = "encargo-pendiente";

        const info = document.createElement("div");
        info.className = "encargo-info";

        const linea1 = document.createElement("div");
        linea1.className = "encargo-profesor";
        linea1.textContent = h.es_qr
            ? `${h.nombre} — ${h.cantidad > 0 ? "Disponible" : "Prestada"} (objeto único)`
            : `${h.nombre} — Quedan: ${h.cantidad}`;

        const linea2 = document.createElement("div");
        linea2.className = "encargo-herramientas";
        const tagsTexto = h.tags.length ? h.tags.join(", ") : "Sin tags";
        linea2.textContent = h.es_qr ? `${tagsTexto} · Con QR` : tagsTexto;

        info.append(linea1, linea2);

        const botones = document.createElement("div");
        botones.className = "fila-botones-admin";

        const btnEditar = document.createElement("button");
        btnEditar.type = "button";
        btnEditar.textContent = "Editar";
        btnEditar.addEventListener("click", () => cargarParaEditar(h));

        const btnBorrar = document.createElement("button");
        btnBorrar.type = "button";
        btnBorrar.className = "btn-devuelto";
        btnBorrar.textContent = "Borrar";
        btnBorrar.addEventListener("click", () => borrarHerramienta(h.id, h.nombre, btnBorrar));

        botones.append(btnEditar, btnBorrar);
        li.append(info, botones);
        $lista.appendChild(li);
    });
}

function cargarParaEditar(h) {
    editandoId = h.id;
    $nombre.value = h.nombre;
    $descripcion.value = h.descripcion || "";
    $cantidad.value = h.cantidad;
    $tags.value = h.tags.join(", ");

    imagenActual = h.imagen || "martillo.png";
    $imagenPreview.src = `${window.APP.staticUrl}img/${imagenActual}`;
    $imagenEstado.textContent = `Imagen actual: ${imagenActual}`;

    tipoActual = h.es_qr ? "con-qr" : "sin-qr";
    qrCodigoActual = h.qr_codigo || null;
    cantidadOriginalEdicion = h.cantidad;
    if ($btnTipoSinQR) $btnTipoSinQR.classList.toggle("activo", tipoActual === "sin-qr");
    if ($btnTipoConQR) $btnTipoConQR.classList.toggle("activo", tipoActual === "con-qr");
    actualizarVisibilidadTipo();

    $titulo.textContent = `Editando: ${h.nombre}`;
    $btnGuardar.textContent = "Guardar cambios";
    $btnCancelar.style.display = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function limpiarFormulario() {
    editandoId = null;
    $nombre.value = "";
    $descripcion.value = "";
    $cantidad.value = "0";
    $tags.value = "";
    $imagenInput.value = "";

    imagenActual = "martillo.png";
    $imagenPreview.src = `${window.APP.staticUrl}img/martillo.png`;
    $imagenEstado.textContent = "Sin imagen (se usará martillo.png)";

    tipoActual = "sin-qr";
    qrCodigoActual = null;
    cantidadOriginalEdicion = 0;
    if ($btnTipoSinQR) $btnTipoSinQR.classList.add("activo");
    if ($btnTipoConQR) $btnTipoConQR.classList.remove("activo");
    actualizarVisibilidadTipo();

    $titulo.textContent = "Agregar herramienta";
    $btnGuardar.textContent = "Agregar herramienta";
    $btnCancelar.style.display = "none";
}

// ---------------------------------------------------------------------------
// Subida de imágenes: vista previa local inmediata + POST
// /api/upload-imagen (Flask guarda en static/img/ con nombre
// único y devuelve el nombre final).
// ---------------------------------------------------------------------------

function inicializarSubidaImagen() {
    if (!$btnElegirImagen || !$imagenInput) return;

    $btnElegirImagen.addEventListener("click", () => $imagenInput.click());

    $imagenInput.addEventListener("change", async (e) => {
        const archivo = e.target.files && e.target.files[0];
        if (!archivo) return;

        // 1) Vista previa local inmediata (no depende del servidor).
        const urlPrevia = URL.createObjectURL(archivo);
        $imagenPreview.src = urlPrevia;
        $imagenEstado.textContent = "Subiendo imagen…";

        try {
            // 2) Subida real al servidor: Flask la guarda en static/img/
            //    con nombre único y devuelve el nombre final.
            const formData = new FormData();
            formData.append("imagen", archivo);

            const res = await fetch("/api/upload-imagen", {
                method: "POST",
                credentials: "same-origin",
                body: formData,
            });
            const data = await res.json();

            if (!res.ok) {
                mostrarAlerta(data.error || "No se pudo subir la imagen", "error");
                $imagenEstado.textContent = "No se subió: se mantiene la imagen anterior";
                $imagenPreview.src = `${window.APP.staticUrl}img/${imagenActual}`;
                return;
            }

            // 3) El nombre devuelto es el que se manda al guardar.
            imagenActual = data.imagen;
            $imagenPreview.src = `${window.APP.staticUrl}img/${imagenActual}`;
            $imagenEstado.textContent = `Imagen actual: ${imagenActual}`;
            mostrarAlerta("Imagen subida.", "exito");
        } catch (error) {
            mostrarAlerta("No se pudo conectar con el servidor.", "error");
            $imagenEstado.textContent = "Error de conexión: se mantiene la imagen anterior";
            $imagenPreview.src = `${window.APP.staticUrl}img/${imagenActual}`;
        } finally {
            URL.revokeObjectURL(urlPrevia);
            $imagenInput.value = "";
        }
    });
}

async function guardar() {
    const nombre = $nombre.value.trim();
    if (!nombre) {
        mostrarAlerta("El nombre es obligatorio.", "error");
        return;
    }
    if (nombre.length > 25) {
        mostrarAlerta("El nombre no puede tener más de 25 caracteres.", "error");
        return;
    }

    const esConQR = tipoActual === "con-qr";
    if (esConQR && !qrCodigoActual) {
        mostrarAlerta("Escaneá el código QR de la herramienta antes de guardar.", "error");
        return;
    }

    const cuerpo = {
        nombre,
        descripcion: $descripcion.value.trim(),
        cantidad: esConQR ? 1 : (parseInt($cantidad.value, 10) || 0),
        imagen: imagenActual || "martillo.png",
        tags: $tags.value,
        es_qr: esConQR ? 1 : 0,
        qr_codigo: esConQR ? qrCodigoActual : null,
    };

    // Crear = POST, editar = PUT (según si hay editandoId).
    const metodo = editandoId ? "PUT" : "POST";
    const url = editandoId ? `/api/herramientas/${editandoId}` : "/api/herramientas";

    try {
        const res = await fetch(url, {
            method: metodo,
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(cuerpo),
        });
        const data = await res.json();

        if (!res.ok) {
            mostrarAlerta(data.error || "No se pudo guardar", "error");
            return;
        }

        mostrarAlerta(editandoId ? "Herramienta actualizada." : "Herramienta agregada.", "exito");
        limpiarFormulario();
        cargarLista();
    } catch (error) {
        mostrarAlerta("No se pudo conectar con el servidor.", "error");
    }
}

async function borrarHerramienta(id, nombre, boton) {
    if (boton.dataset.confirmando !== "true") {
        boton.dataset.confirmando = "true";
        boton.dataset.textoOriginal = boton.textContent;
        boton.textContent = "¿Seguro? Tocá de nuevo";
        boton.classList.add("btn-confirmar-borrado");

        boton.dataset.timeoutId = setTimeout(() => {
            boton.dataset.confirmando = "false";
            boton.textContent = boton.dataset.textoOriginal;
            boton.classList.remove("btn-confirmar-borrado");
        }, 4000);
        return;
    }

    clearTimeout(Number(boton.dataset.timeoutId));
    boton.disabled = true;
    boton.textContent = "Borrando…";

    try {
        const res = await fetch(`/api/herramientas/${id}`, {
            method: "DELETE",
            credentials: "same-origin",
        });
        const data = await res.json();

        if (!res.ok) {
            mostrarAlerta(data.error || "No se pudo borrar", "error");
            boton.disabled = false;
            boton.dataset.confirmando = "false";
            boton.textContent = "Borrar";
            boton.classList.remove("btn-confirmar-borrado");
            return;
        }

        mostrarAlerta(`"${nombre}" borrada.`, "exito");
        if (editandoId === id) limpiarFormulario();
        cargarLista();
    } catch (error) {
        mostrarAlerta("No se pudo conectar con el servidor.", "error");
        boton.disabled = false;
        boton.dataset.confirmando = "false";
        boton.textContent = "Borrar";
        boton.classList.remove("btn-confirmar-borrado");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    cargarLista();
    inicializarSubidaImagen();

    if ($btnGuardar) $btnGuardar.addEventListener("click", guardar);
    if ($btnCancelar) $btnCancelar.addEventListener("click", limpiarFormulario);

    if ($btnTipoSinQR) $btnTipoSinQR.addEventListener("click", () => cambiarTipo("sin-qr"));
    if ($btnTipoConQR) {
        $btnTipoConQR.addEventListener("click", () => {
            if (!(typeof esMovil === "function" && esMovil())) {
                mostrarAlerta("Para agregar una herramienta con QR necesitás usar el celular.", "error");
                return;
            }
            cambiarTipo("con-qr");
        });
    }

    if ($btnEscanearRegistro) {
        $btnEscanearRegistro.addEventListener("click", () => {
            abrirEscaneoQR((codigo) => {
                qrCodigoActual = codigo;
                mostrarAlerta("Código QR escaneado.", "exito");
                actualizarVisibilidadTipo();
            });
        });
    }

    actualizarVisibilidadTipo();
});
