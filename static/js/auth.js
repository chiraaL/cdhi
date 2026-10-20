
// auth.js — Guardián de las páginas protegidas.
//
// - Verifica la sesión con GET /api/check-session y redirige
//   a /login si no hay sesión activa.
// - credentials: "same-origin" para que la cookie de sesión
//   viaje en cada pedido.

fetch("/api/check-session", { credentials: "same-origin" })
    .then((res) => res.json())
    .then((data) => {
        if (!data.logueado) {
            window.location.href = "/login";
            return;
        }
    })
    .catch(() => { window.location.href = "/login"; });

document.addEventListener("DOMContentLoaded", () => {
    const btnLogout = document.getElementById("btn-logout");
    if (!btnLogout) return;

    btnLogout.addEventListener("click", async () => {
        btnLogout.disabled = true;
        await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
        window.location.href = "/login";
    });
});
