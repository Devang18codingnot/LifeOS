function openProfile() {
    showScreen("profileScreen");
    loadProfile();
}

async function loadProfile() {
    try {
        const response = await fetch(`${API_BASE_URL}/profile`, { credentials: "include" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not load profile.");
        const form = document.getElementById("profileForm");
        Object.entries(result.profile || {}).forEach(([field, value]) => {
            if (form.elements[field]) form.elements[field].value = value;
        });
    } catch (error) {
        document.getElementById("profileStatus").textContent = error.message;
    }
}

async function saveProfile(event) {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form).entries());
    const status = document.getElementById("profileStatus");
    try {
        const response = await fetch(`${API_BASE_URL}/profile`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(data)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Could not save profile.");
        status.textContent = "Medical profile saved.";
    } catch (error) {
        status.textContent = error.message;
    }
}
