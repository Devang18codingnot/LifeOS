const API_BASE_URL = window.location.protocol === "file:"
    ? "http://127.0.0.1:5000/api"
    : window.location.port === "5500"
        ? `${window.location.protocol}//${window.location.hostname}:5000/api`
        : `${window.location.origin}/api`;

function toggleAuthorityPassword() {
    const input = document.getElementById("authorityPassword");
    const button = document.getElementById("authorityPasswordToggle");
    if (!input || !button) return;

    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    button.textContent = visible ? "Show" : "Hide";
    button.setAttribute("aria-label", visible ? "Show password" : "Hide password");
}

async function submitAuthorityLogin(event) {
    event.preventDefault();
    const error = document.getElementById("authorityLoginError");
    const submit = document.getElementById("authoritySubmit");
    error.textContent = "";
    if (submit) {
        submit.disabled = true;
        submit.querySelector("span").textContent = "Verifying access...";
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                email: document.getElementById("authorityEmail").value.trim(),
                password: document.getElementById("authorityPassword").value,
                authorityCode: document.getElementById("authorityCode").value,
                accountType: "authority"
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Authority login failed.");
        window.location.replace("/authority");
    } catch (loginError) {
        error.textContent = loginError.message;
        if (submit) {
            submit.disabled = false;
            submit.querySelector("span").textContent = "Enter command center";
        }
    }
}
