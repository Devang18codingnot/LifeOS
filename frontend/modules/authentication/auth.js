function updateTopbarAuth() {
    const accountMenuButton = document.getElementById("accountMenuButton");
    const accountMenuPanel = document.getElementById("accountMenuPanel");

    if (!accountMenuButton || !accountMenuPanel) return;

    if (lifeOS.user) {
        accountMenuButton.textContent = "☰";
        accountMenuButton.setAttribute("aria-label", "Open account menu");
        accountMenuButton.title = "Account menu";
        accountMenuButton.onclick = toggleAccountMenu;
        accountMenuPanel.hidden = true;
    } else {
        accountMenuPanel.hidden = true;
        accountMenuButton.textContent = "Log in";
        accountMenuButton.setAttribute("aria-label", "Log in");
        accountMenuButton.title = "Log in";
        accountMenuButton.onclick = () => window.location.href = "/login";
    }

    accountMenuButton.setAttribute("aria-expanded", "false");
}

function toggleAccountMenu(event) {
    if (event) event.stopPropagation();

    const accountMenuButton = document.getElementById("accountMenuButton");
    const accountMenuPanel = document.getElementById("accountMenuPanel");
    if (!accountMenuButton || !accountMenuPanel || !lifeOS.user) return;

    const isOpening = accountMenuPanel.hidden;
    accountMenuPanel.hidden = !isOpening;
    accountMenuButton.setAttribute("aria-expanded", String(isOpening));
}

function closeAccountMenu() {
    const accountMenuButton = document.getElementById("accountMenuButton");
    const accountMenuPanel = document.getElementById("accountMenuPanel");
    if (!accountMenuButton || !accountMenuPanel) return;

    accountMenuPanel.hidden = true;
    accountMenuButton.setAttribute("aria-expanded", "false");
}

async function checkSession() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            credentials: "include"
        });
        const result = await response.json();
        if (response.ok && result.user) {
            lifeOS.user = result.user;
            updateTopbarAuth();
            showScreen("homeScreen");
            loadLifeSavedHistory();
            syncQueuedReports();
        } else if (window.location.pathname !== "/login") {
            lifeOS.user = null;
            updateTopbarAuth();
            window.location.href = "/login";
        }
    } catch (error) {
        console.warn("Could not check login session:", error.message);
        lifeOS.user = null;
        updateTopbarAuth();
    }
}

async function logout() {
    const logoutMenuButton = document.getElementById("logoutMenuButton");

    if (logoutMenuButton) {
        logoutMenuButton.disabled = true;
        logoutMenuButton.setAttribute("aria-busy", "true");
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/logout`, {
            method: "POST",
            credentials: "include"
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || "Could not log out. Please try again.");
        }

        lifeOS.user = null;
        window.location.replace("/login");
    } catch (error) {
        console.error("Logout failed:", error);
        if (logoutMenuButton) {
            logoutMenuButton.disabled = false;
            logoutMenuButton.removeAttribute("aria-busy");
        }
        alert(error.message);
    }
}
