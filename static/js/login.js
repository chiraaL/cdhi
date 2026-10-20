
// login.js — Lógica de la pantalla de inicio de sesión.
//
// - Envía usuario y contraseña a POST /api/login.
// - credentials: "same-origin" para recibir la cookie de sesión.
// - Tras login exitoso redirige a /index.
// - Se escucha "submit" (no "click"): así funciona tanto con
//   el botón como presionando Enter dentro de los inputs.

const $formulario = document.getElementById("form-login"),
      $password = document.getElementById("password"),
      $username = document.getElementById("username"),
      $visible = document.getElementById("visible");

document.addEventListener("change", (e) => {
    if (e.target === $visible) {
        $password.type = $visible.checked ? "text" : "password";
    }
});

$formulario.addEventListener("submit", async (e) => {
    e.preventDefault();

    if ($username.value.trim() === "" || $password.value.trim() === "") {
        mostrarAlerta("Completá el usuario y la contraseña.", "error");
        return;
    }

    try {
        const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
                username: $username.value.trim(),
                password: $password.value,
            }),
        });

        const data = await res.json();

        if (res.ok && data.ok) {
            window.location.href = "/index";
        } else {
            mostrarAlerta(data.error || "Usuario o contraseña incorrectos", "error");
        }
    } catch (error) {
        mostrarAlerta("No se pudo conectar con el servidor.", "error");
    }
});
