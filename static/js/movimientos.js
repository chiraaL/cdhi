
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
    renderCarritoEn("carrito-seleccion-movil");
}

function quitarDelCarrito(id) {
    carrito = carrito.filter((item) => item.id === id);
    renderCarrito();
    renderCarritoEn("carrito-seleccion-movil");
}

function renderCarritoEn(idContenedor) {
    const contenedor = document.getElementById(idContenedor);
    if (!contenedor) return;

    if (carrito.length === 0) {
        contenedor.innerHTML = '<p class="carrito-vacio">El carrito está vacío.</p>';
    } else {
        contenedor.innerHTML = "";
        carrito.forEach((item) => {
            const fila = document.createElement("div");
            fila.className = "carrito-item";

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
                else {
                    renderCarrito();
                    renderCarritoEn("carrito-seleccion-movil");
                }
            });

            const cantidad = document.createElement("span");
            cantidad.className = "carrito-item-cantidad";
            cantidad.textContent = item.cantidad;

            const btnMas = document.createElement("button");
            btnMas.type = "button";
            btnMas.textContent = "+";
            btnMas.title = "Agregar una unidad";

            const herramientaEnCache = herramientasCache.find((h) => h.id === item.id);
            const stockDisponible = herramientaEnCache ? herramientaEnCache.cantidad : 0;
            if (item.es_qr || item.cantidad >= stockDisponible) {
                btnMas.disabled = true;
            }

            btnMas.addEventListener("click", () => {
                if (item.es_qr) return;

                const h = herramientasCache.find((t) => t.id === item.id);
                const max = h ? h.cantidad : 0;

                if (item.cantidad >= max) {
                    if (typeof mostrarAlerta === "function") {
                        mostrarAlerta(`No hay más stock de ${item.nombre}.`, "error");
                    }
                    return;
                }

                item.cantidad += 1;
                renderCarrito();
                renderCarritoEn("carrito-seleccion-movil");
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
}

function renderCarrito() {
    renderCarritoEn("carrito-seleccion");
}

function refrescarGrilla() {
    // Vuelve a dibujar la grilla con los datos ya cargados,
    // sin hacer fetch al servidor, para que no parpadee.
    if (typeof renderGrilla === "function" && typeof filtrarLista === "function") {
        const $buscador = document.getElementById("buscador-input");
        renderGrilla(filtrarLista($buscador ? $buscador.value : ""));
    }
}

// ---------------------------------------------------------------------
// Modal móvil: registro de salida (se abre con botón flotante en celular)
// ---------------------------------------------------------------------

let modalSalidaMovilAbierto = false;

function abrirModalSalidaMovil() {
    const overlay = document.getElementById("modal-salida-movil");
    if (!overlay) return;
    document.body.classList.add("modal-abierto");
    overlay.classList.add("visible");
    modalSalidaMovilAbierto = true;
    renderCarritoEn("carrito-seleccion-movil");
}

function cerrarModalSalidaMovil() {
    const overlay = document.getElementById("modal-salida-movil");
    if (!overlay) return;
    overlay.classList.remove("visible");
    document.body.classList.remove("modal-abierto");
    modalSalidaMovilAbierto = false;
}

function registrarSalidaDesdeInputs(idProfesor, idAlumno, idAnio, idDivision, idBtn) {
    const profesor = document.getElementById(idProfesor).value.trim();
    const alumno = document.getElementById(idAlumno).value.trim();
    const cursoAnio = document.getElementById(idAnio).value.trim();
    const cursoDivision = document.getElementById(idDivision).value.trim();
    const btn = document.getElementById(idBtn);

    if (!alumno || !cursoAnio || !cursoDivision || carrito.length === 0) {
        if (typeof mostrarAlerta === "function") {
            mostrarAlerta("Completá los campos requeridos y agregá herramientas.", "error");
        }
        return;
    }

    const curso = `${cursoAnio}mo ${cursoDivision}da`;
    const items = carrito.map((i) => ({ herramienta_id: i.id, cantidad: i.cantidad }));

    btn.disabled = true;
    btn.textContent = "Registrando…";

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
            renderCarritoEn("carrito-seleccion-movil");
            if (typeof mostrarAlerta === "function") {
                mostrarAlerta("Salida registrada con éxito.", "exito");
            }
            cargarEncargosPendientes();
            if (typeof cargarHerramientas === "function") cargarHerramientas();
            cerrarModalSalidaMovil();
        } else {
            const data = await res.json();
            if (typeof mostrarAlerta === "function") {
                mostrarAlerta(data.error || "Error al registrar", "error");
            }
        }
    } catch (e) {
        if (typeof mostrarAlerta === "function") {
            mostrarAlerta("No se pudo conectar con el servidor.", "error");
        }
    } finally {
        btn.disabled = false;
        btn.textContent = "Registrar salida";
    }
}

async function registrarSalida() {
    const profesor = document.getElementById("profesor").value.trim();
    const alumno = document.getElementById("alumno").value.trim();
    const cursoAnio = document.getElementById("curso-anio").value.trim();
    const cursoDivision = document.getElementById("curso-division").value.trim();

    if (!alumno || !cursoAnio || !cursoDivision || carrito.length === 0) {
        if (typeof mostrarAlerta === "function") {
            mostrarAlerta("Completá los campos requeridos y agregá herramientas.", "error");
        }
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
            renderCarritoEn("carrito-seleccion-movil");
            if (typeof mostrarAlerta === "function") {
                mostrarAlerta("Salida registrada con éxito.", "exito");
            }
            cargarEncargosPendientes();
            if (typeof cargarHerramientas === "function") cargarHerramientas();
        } else {
            const data = await res.json();
            if (typeof mostrarAlerta === "function") {
                mostrarAlerta(data.error || "Error al registrar", "error");
            }
        }
    } catch (e) {
        if (typeof mostrarAlerta === "function") {
            mostrarAlerta("No se pudo conectar con el servidor.", "error");
        }
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

    // PC: botón "Registrar salida" del sidebar.
    const btnSalida = document.getElementById("btn-salida");
    if (btnSalida) btnSalida.addEventListener("click", registrarSalida);

    // Móvil: botón flotante que abre el modal de salida.
    const btnAbrirSalida = document.getElementById("btn-abrir-salida-movil");
    const btnCerrarSalida = document.getElementById("btn-cerrar-salida-movil");
    const btnSalidaMovil = document.getElementById("btn-salida-movil");

    if (btnAbrirSalida) {
        btnAbrirSalida.addEventListener("click", abrirModalSalidaMovil);
    }
    if (btnCerrarSalida) {
        btnCerrarSalida.addEventListener("click", cerrarModalSalidaMovil);
    }
    if (btnSalidaMovil) {
        btnSalidaMovil.addEventListener("click", () => {
            registrarSalidaDesdeInputs(
                "profesor-movil",
                "alumno-movil",
                "curso-anio-movil",
                "curso-division-movil",
                "btn-salida-movil"
            );
        });
    }

    // Cerrar modal al hacer clic fuera de la caja.
    const overlayMovil = document.getElementById("modal-salida-movil");
    if (overlayMovil) {
        overlayMovil.addEventListener("click", (e) => {
            if (e.target === overlayMovil) cerrarModalSalidaMovil();
        });
    }
});
