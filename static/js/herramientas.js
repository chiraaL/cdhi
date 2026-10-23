
// herramientas.js — Grilla del inventario principal.
//
// La imagen de cada tarjeta se construye con window.APP.staticUrl
// (definido en base.html), así el JS no depende de dónde esté
// montada la app.

let herramientasCache = [];

// Paginación (solo PC). En móvil se muestran todas las herramientas.
let paginaActual = 1;
const itemsPorPagina = 6;
let listaFiltradaActual = [];

async function cargarHerramientas() {
    const contenedor = document.querySelector(".grilla-herramientas");
    if (!contenedor) return;

    contenedor.innerHTML = "";

    try {
        const res = await fetch("/api/herramientas", { credentials: "same-origin" });
        if (!res.ok) throw new Error("Error al cargar");
        herramientasCache = await res.json();

        if (herramientasCache.length === 0) {
            contenedor.innerHTML = "<p>Todavía no hay herramientas cargadas en el pañol.</p>";
            return;
        }

        const $buscador = document.getElementById("buscador-input");
        renderGrilla(filtrarLista($buscador ? $buscador.value : ""));
    } catch (error) {
        contenedor.innerHTML = "<p>No se pudieron cargar las herramientas.</p>";
    }
}

function filtrarLista(consulta) {
    const q = consulta.trim().toLowerCase().replace(/^#/, "");
    if (!q) return herramientasCache;

    return herramientasCache.filter((h) => {
        const enNombre = h.nombre.toLowerCase().includes(q);
        const enDescripcion = (h.descripcion || "").toLowerCase().includes(q);
        const enTags = (h.tags || []).some((tag) => tag.toLowerCase().includes(q));
        return enNombre || enDescripcion || enTags;
    });
}

function calcularStockVisible(herramienta) {
    const enCarrito = typeof carrito !== "undefined" ? carrito : [];
    const reservado = enCarrito.find((item) => item.id === herramienta.id);
    const cantidadReservada = reservado ? reservado.cantidad : 0;
    return Math.max(0, herramienta.cantidad - cantidadReservada);
}

function textoStockBadge(herramienta, stockVisible) {
    if (herramienta.es_qr) {
        return stockVisible > 0 ? "Disponible" : "Prestada";
    }
    return stockVisible > 0 ? `Quedan: ${stockVisible}` : "Sin stock";
}

function renderGrilla(lista) {
    // En móvil no se paginan: se muestran todas.
    if (typeof esMovil === "function" && esMovil()) {
        paginaActual = 1;
        listaFiltradaActual = lista;
        const contenedor = document.querySelector(".grilla-herramientas");
        if (!contenedor) return;
        contenedor.innerHTML = "";
        if (lista.length === 0) {
            contenedor.innerHTML = '<p class="sin-resultados">No se encontraron herramientas.</p>';
            return;
        }
        dibujarItems(lista);
        const controles = document.getElementById("paginacion-herramientas");
        if (controles) controles.style.display = "none";
        return;
    }

    // PC: paginar de 6 en 6.
    paginaActual = 1;
    listaFiltradaActual = lista;
    renderPagina(1);
    renderControlesPaginacion();
}

function renderPagina(pagina) {
    const contenedor = document.querySelector(".grilla-herramientas");
    if (!contenedor) return;
    contenedor.innerHTML = "";

    const inicio = (pagina - 1) * itemsPorPagina;
    const fin = inicio + itemsPorPagina;
    const itemsPagina = listaFiltradaActual.slice(inicio, fin);

    if (itemsPagina.length === 0) {
        contenedor.innerHTML = '<p class="sin-resultados">No se encontraron herramientas.</p>';
        return;
    }

    dibujarItems(itemsPagina);
}

function dibujarItems(items) {
    const contenedor = document.querySelector(".grilla-herramientas");
    if (!contenedor) return;

    items.forEach((h) => {
        const contenido = document.createElement("div");
        contenido.className = "contenido";
        contenido.dataset.id = h.id;

        const imgTag = document.createElement("div");
        imgTag.className = "img-tag";

        const img = document.createElement("img");
        img.src = `${window.APP.staticUrl}img/${h.imagen || "martillo.png"}`;
        img.className = "FT-HRM";
        img.alt = h.nombre;
        imgTag.appendChild(img);

        const infoDiv = document.createElement("div");
        infoDiv.className = "titulo-desc-carrito";

        const stockBadge = document.createElement("span");
        stockBadge.className = "stock-badge";
        const stockVisible = calcularStockVisible(h);
        stockBadge.textContent = textoStockBadge(h, stockVisible);
        if (stockVisible <= 0) stockBadge.classList.add("sin-stock");

        const titulo = document.createElement("h1");
        titulo.className = "Nombre-HRM";
        titulo.textContent = h.nombre;

        const btnCarrito = document.createElement("button");
        btnCarrito.type = "button";
        btnCarrito.className = "carrito";
        btnCarrito.textContent = "Carrito";
        if (stockVisible <= 0) btnCarrito.disabled = true;
        btnCarrito.addEventListener("click", () => {
            if (typeof agregarAlCarrito === "function") {
                agregarAlCarrito(h.id, h.nombre, h.es_qr);
            }
        });

        infoDiv.append(stockBadge, titulo, btnCarrito);
        contenido.append(imgTag, infoDiv);
        contenedor.appendChild(contenido);
    });
}

function renderControlesPaginacion() {
    const contenedor = document.getElementById("paginacion-herramientas");
    if (!contenedor) return;

    const total = Math.ceil(listaFiltradaActual.length / itemsPorPagina) || 1;
    if (total <= 1) {
        contenedor.style.display = "none";
        return;
    }

    contenedor.style.display = "flex";
    document.getElementById("num-pagina-actual").textContent = paginaActual;
    document.getElementById("num-paginas").textContent = total;
    document.getElementById("btn-pagina-anterior").disabled = paginaActual === 1;
    document.getElementById("btn-pagina-siguiente").disabled = paginaActual === total;
}

document.getElementById("btn-pagina-anterior")?.addEventListener("click", () => {
    if (paginaActual > 1) {
        paginaActual--;
        renderPagina(paginaActual);
        renderControlesPaginacion();
    }
});

document.getElementById("btn-pagina-siguiente")?.addEventListener("click", () => {
    const total = Math.ceil(listaFiltradaActual.length / itemsPorPagina) || 1;
    if (paginaActual < total) {
        paginaActual++;
        renderPagina(paginaActual);
        renderControlesPaginacion();
    }
});

document.addEventListener("DOMContentLoaded", () => {
    cargarHerramientas();

    // El buscador filtra en vivo mientras se escribe.
    const $buscador = document.getElementById("buscador-input");
    if ($buscador) {
        $buscador.addEventListener("input", () => {
            renderGrilla(filtrarLista($buscador.value));
        });
    }
});
