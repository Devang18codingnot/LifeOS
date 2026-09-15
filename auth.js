const API_BASE_URL = window.location.protocol === "file:"
    ? "http://127.0.0.1:5000/api"
    : window.location.port === "5500"
        ? `${window.location.protocol}//${window.location.hostname}:5000/api`
        : `${window.location.origin}/api`;

let authMode = "login";

function togglePasswordVisibility() {
    const passwordInput = document.getElementById("authPassword");
    const passwordToggle = document.getElementById("passwordToggle");
    if (!passwordInput || !passwordToggle) return;

    const isVisible = passwordInput.type === "text";
    passwordInput.type = isVisible ? "password" : "text";
    passwordToggle.textContent = isVisible ? "Show" : "Hide";
    passwordToggle.setAttribute("aria-label", isVisible ? "Show password" : "Hide password");
    passwordToggle.setAttribute("aria-pressed", String(!isVisible));
}

async function redirectIfLoggedIn() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            credentials: "include"
        });
        const result = await response.json();
        if (response.ok && result.user) {
            window.location.href = result.user.is_authority ? "/authority" : "/";
        }
    } catch (error) {
        console.warn("Could not check login session:", error.message);
    }
}

function toggleAuthMode() {
    authMode = authMode === "login" ? "register" : "login";
    const registering = authMode === "register";
    document.getElementById("authTitle").textContent = registering ? "Create your account" : "Welcome back";
    document.getElementById("authSubtitle").textContent = registering
        ? "Create an account to securely save your emergency reports."
        : "Log in to securely save and access your emergency reports.";
    document.getElementById("nameField").hidden = !registering;
    document.getElementById("authName").required = registering;
    document.getElementById("authPassword").autocomplete = registering ? "new-password" : "current-password";
    document.getElementById("authSubmitText").textContent = registering ? "Create account" : "Log in";
    document.getElementById("authToggle").textContent = registering ? "Already have an account? Log in" : "Create an account";
    document.getElementById("authError").textContent = "";
}

async function submitAuth(event) {
    event.preventDefault();
    const errorElement = document.getElementById("authError");
    errorElement.textContent = "";

    const payload = {
        email: document.getElementById("authEmail").value.trim(),
        password: document.getElementById("authPassword").value,
        accountType: "user"
    };
    if (authMode === "register") {
        payload.name = document.getElementById("authName").value.trim();
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/${authMode}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Authentication failed.");
        window.location.href = result.user && result.user.is_authority ? "/authority" : "/";
    } catch (error) {
        errorElement.textContent = error.message;
    }
}

redirectIfLoggedIn();
