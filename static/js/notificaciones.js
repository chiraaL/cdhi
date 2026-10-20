

function mostrarAlerta(mensaje, tipo = "error") {
    let contenedor = document.getElementById("notificaciones");

    if (!contenedor) {
        contenedor = document.createElement("div");
        contenedor.id = "notificaciones";
        document.body.appendChild(contenedor);
    }

    const aviso = document.createElement("div");
    aviso.className = `aviso aviso-${tipo}`;

    const texto = document.createElement("span");
    texto.textContent = mensaje;

    const cerrar = document.createElement("button");
    cerrar.type = "button";
    cerrar.className = "aviso-cerrar";
    cerrar.textContent = "×";
    cerrar.setAttribute("aria-label", "Cerrar aviso");
    cerrar.addEventListener("click", () => quitarAviso(aviso));

    aviso.append(texto, cerrar);
    contenedor.appendChild(aviso);

    setTimeout(() => quitarAviso(aviso), 5000);
}

function quitarAviso(aviso) {
    if (!aviso || !aviso.parentNode) return;
    aviso.classList.add("aviso-saliendo");
    setTimeout(() => aviso.remove(), 250);
}

window.mostrarAlerta = mostrarAlerta;
