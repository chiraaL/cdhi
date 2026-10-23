
// movimientos.js — Carrito, "Registrar salida", encargos pendientes
// y botón "Devuelto".
//
// Notas de implementación:
//  - credentials: "same-origin" en todos los fetch (la creación y
//    devolución de encargos requieren sesión).
//  - "Devuelto" ahora chequea res.ok: antes ignoraba errores del
//    servidor (ej. encargo inexistente) y refrescaba igual.
//  - El botón se deshabilita mientras se procesa, para evitar
//    devoluciones duplicadas por doble clic.

let carrito = [];

function agregarAlCarrito(id, nombre, es_qr) {
    const existente = carrito.find((item) => item.id === id);
    if (existente) {
        // Objeto único (QR): ya está en el carrito, no se suma.
        if (!es_qr) existente.cantidad += 1;
    } else {
        carrito.push({ id, nombre, cantidad: 1, es_qr: !!es_qr });
    }
    renderCarrito();
}
window.agregarAlCarrito = agregarAlCarrito;

function quitarDelCarrito(id) {
    carrito = carrito.filter((item) => item.id !== id);
    renderCarrito();
}

function refrescarGrilla() {
    // Vuelve a dibujar la grilla con los datos ya cargados,
    // sin hacer fetch al servidor, para que no parpadee.
    if (typeof renderGrilla === "function" && typeof filtrarLista === "function") {
        const $buscador = document.getElementById("buscador-input");
        renderGrilla(filtrarLista($buscador ? $buscador.value : ""));
    }
}

function renderCarrito() {
    const contenedor = document.getElementById("carrito-seleccion");
    if (!contenedor) return;

    if (carrito.length === 0) {
        contenedor.innerHTML = '<p class="carrito-vacio">El carrito está vacío.</p>';
    } else {
        contenedor.innerHTML = "";
        carrito.forEach((item) => {
            const fila = document.createElement("div");
            fila.className = "carrito-item";

            // Todo por textContent: el nombre viene de la base
            // y no debe interpretarse como HTML (XSS).
            const nombre = document.createElement("span");
            nombre.className = "carrito-item-nombre";
            nombre.textContent = `${item.nombre} (x${item.cantidad})`;

            const controles = document.createElement("div");
            controles.className = "carrito-item-controles";

            const btnMenos = document.createElement("button");
            btnMenos.type = "button";
            btnMenos.textContent = "−";
            btnMenos.title = "Sacar una unidad";
            btnMenos.addEventListener("click", () => {
                item.cantidad -= 1;
                if (item.cantidad <= 0) quitarDelCarrito(item.id);
                else renderCarrito();
            });

            const cantidad = document.createElement("span");
            cantidad.className = "carrito-item-cantidad";
            cantidad.textContent = item.cantidad;

            const btnMas = document.createElement("button");
            btnMas.type = "button";
            btnMas.textContent = "+";
            btnMas.title = "Agregar una unidad";
            btnMas.addEventListener("click", () => {
                // Objeto único (QR): no se puede llevar más de 1.
                if (!item.es_qr) item.cantidad += 1;
                renderCarrito();
            });

            const btnQuitar = document.createElement("button");
            btnQuitar.type = "button";
            btnQuitar.className = "carrito-item-quitar";
            btnQuitar.textContent = "Quitar";
            btnQuitar.title = "Sacar del carrito";
            btnQuitar.addEventListener("click", () => quitarDelCarrito(item.id));

            controles.append(btnMenos, cantidad, btnMas, btnQuitar);
            fila.append(nombre, controles);
            contenedor.appendChild(fila);
        });
    }

    refrescarGrilla();
}

async function registrarSalida() {
    const profesor = document.getElementById("profesor").value.trim();
    const alumno = document.getElementById("alumno").value.trim();
    const cursoAnio = document.getElementById("curso-anio").value.trim();
    const cursoDivision = document.getElementById("curso-division").value.trim();

    if (!alumno || !cursoAnio || !cursoDivision || carrito.length === 0) {
        mostrarAlerta("Completá los campos requeridos y agregá herramientas.", "error");
        return;
    }

    const curso = `${cursoAnio}mo ${cursoDivision}da`;
    const items = carrito.map((i) => ({ herramienta_id: i.id, cantidad: i.cantidad }));

    try {
        const res = await fetch("/api/prestamos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ profesor, alumno, curso, items }),
        });

        if (res.ok) {
            carrito = [];
            renderCarrito();
            mostrarAlerta("Salida registrada con éxito.", "exito");
            cargarEncargosPendientes();
            if (typeof cargarHerramientas === "function") cargarHerramientas();
        } else {
            const data = await res.json();
            mostrarAlerta(data.error || "Error al registrar", "error");
        }
    } catch (e) {
        mostrarAlerta("No se pudo conectar con el servidor.", "error");
    }
}

async function cargarEncargosPendientes() {
    const lista = document.getElementById("lista-encargos");
    if (!lista) return;

    try {
        const res = await fetch("/api/prestamos?estado=pendiente", { credentials: "same-origin" });
        const encargos = await res.json();

        if (encargos.length === 0) {
            lista.innerHTML = '<li class="sin-movimientos">Sin herramientas afuera.</li>';
            return;
        }

        lista.innerHTML = "";
        encargos.forEach((enc) => {
            const li = document.createElement("li");
            li.className = "encargo-pendiente";

            const info = document.createElement("div");
            info.className = "encargo-info";

            const profesor = document.createElement("div");
            profesor.className = "encargo-profesor";
            profesor.textContent = `Profesor: ${enc.profesor || "Sin especificar"}`;

            const alumno = document.createElement("div");
            alumno.className = "encargo-herramientas";
            const curso = enc.curso ? ` (${enc.curso})` : "";
            alumno.textContent = `Alumno: ${enc.alumno || "Sin especificar"}${curso}`;

            const herramientas = document.createElement("div");
            herramientas.className = "encargo-herramientas";
            herramientas.textContent = `Herramientas: ${enc.lista_herramientas || "Sin detalle"}`;

            info.append(profesor, alumno, herramientas);

            const btnDev = document.createElement("button");
            btnDev.className = "btn-devuelto";
            btnDev.textContent = "Devuelto";
            btnDev.addEventListener("click", async () => {
                btnDev.disabled = true;
                btnDev.textContent = "Devolviendo…";
                try {
                    const res = await fetch(`/api/prestamos/${enc.id}/devolver`, {
                        method: "POST",
                        credentials: "same-origin",
                    });
                    if (!res.ok) {
                        const data = await res.json();
                        mostrarAlerta(data.error || "No se pudo registrar la devolución", "error");
                        btnDev.disabled = false;
                        btnDev.textContent = "Devuelto";
                        return;
                    }
                    mostrarAlerta("Encargo devuelto. Stock repuesto.", "exito");
                    cargarEncargosPendientes();
                    if (typeof cargarHerramientas === "function") cargarHerramientas();
                } catch (e) {
                    mostrarAlerta("No se pudo conectar con el servidor.", "error");
                    btnDev.disabled = false;
                    btnDev.textContent = "Devuelto";
                }
            });

            li.append(info, btnDev);
            lista.appendChild(li);
        });
    } catch (e) {
        lista.innerHTML = '<li class="sin-movimientos">Error al cargar encargos.</li>';
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // Solo en la página de inventario (index) existe el sidebar
    // y los elementos que maneja este módulo.
    if (!document.getElementById("sidebar-salida")) return;

    cargarEncargosPendientes();
    const btnSalida = document.getElementById("btn-salida");
    if (btnSalida) btnSalida.addEventListener("click", registrarSalida);
});
