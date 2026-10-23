
// herramientas.js — Grilla del inventario principal.
//
// La imagen de cada tarjeta se construye con window.APP.staticUrl
// (definido en base.html), así el JS no depende de dónde esté
// montada la app.

let herramientasCache = [];

// Paginación solo para celular: 4 objetos por página.
let paginaActualMovil = 1;
const itemsPorPaginaMovil = 4;
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

function dibujarHerramienta(h, contenedor) {
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
}

function renderGrilla(lista) {
    const contenedor = document.querySelector(".grilla-herramientas");
    if (!contenedor) return;

    contenedor.innerHTML = "";

    if (lista.length === 0) {
        contenedor.innerHTML = '<p class="sin-resultados">No se encontraron herramientas.</p>';
        const controles = document.getElementById("paginacion-herramientas");
        if (controles) controles.style.display = "none";
        return;
    }

    listaFiltradaActual = lista;
    paginaActualMovil = 1;

    // En celular: paginar de 4 en 4. En PC: mostrar todas.
    if (typeof esMovil === "function" && esMovil()) {
        renderPaginaMovil(1);
        renderControlesPaginacionMovil();
    } else {
        lista.forEach((h) => dibujarHerramienta(h, contenedor));
        const controles = document.getElementById("paginacion-herramientas");
        if (controles) controles.style.display = "none";
    }
}

function renderPaginaMovil(pagina) {
    const contenedor = document.querySelector(".grilla-herramientas");
    if (!contenedor) return;
    contenedor.innerHTML = "";

    const inicio = (pagina - 1) * itemsPorPaginaMovil;
    const fin = inicio + itemsPorPaginaMovil;
    const itemsPagina = listaFiltradaActual.slice(inicio, fin);

    itemsPagina.forEach((h) => dibujarHerramienta(h, contenedor));
}

function renderControlesPaginacionMovil() {
    const contenedor = document.getElementById("paginacion-herramientas");
    if (!contenedor) return;

    const total = Math.ceil(listaFiltradaActual.length / itemsPorPaginaMovil) || 1;
    if (total <= 1) {
        contenedor.style.display = "none";
        return;
    }

    contenedor.style.display = "flex";
    document.getElementById("num-pagina-actual").textContent = paginaActualMovil;
    document.getElementById("num-paginas").textContent = total;
    document.getElementById("btn-pagina-anterior").disabled = paginaActualMovil === 1;
    document.getElementById("btn-pagina-siguiente").disabled = paginaActualMovil === total;
}

document.getElementById("btn-pagina-anterior")?.addEventListener("click", () => {
    if (paginaActualMovil > 1) {
        paginaActualMovil--;
        renderPaginaMovil(paginaActualMovil);
        renderControlesPaginacionMovil();
    }
});

document.getElementById("btn-pagina-siguiente")?.addEventListener("click", () => {
    const total = Math.ceil(listaFiltradaActual.length / itemsPorPaginaMovil) || 1;
    if (paginaActualMovil < total) {
        paginaActualMovil++;
        renderPaginaMovil(paginaActualMovil);
        renderControlesPaginacionMovil();
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
