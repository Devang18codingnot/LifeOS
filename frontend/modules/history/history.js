function renderLifeHistory(reports) {
    const list = document.getElementById("lifeHistoryList");
    const summary = document.getElementById("historySummary");

    if (!list) return;

    if (!reports || reports.length === 0) {
        list.innerHTML = '<div class="history-empty">No saved life events yet.</div>';
        if (summary) summary.textContent = "Recent";
        return;
    }

    const items = reports.slice(0, 5).map((report) => {
        const type = report.type || report.emergencyType || "Emergency";
        const date = report.created_at
            ? new Date(report.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric"
            })
            : "Recent";

        const locationLabel = report.locationLabel || report.location?.label || "Location recorded";
        const statusText = report.status === "resolved" ? "Saved" : "Logged";

        return `
            <article class="history-item">
                <div class="history-item__icon">✦</div>
                <div class="history-item__content">
                    <div class="history-item__topline">
                        <strong>${type}</strong>
                        <span>${statusText}</span>
                    </div>
                    <small>${date}</small>
                    <p>${locationLabel}</p>
                </div>
            </article>
        `;
    }).join("");

    list.innerHTML = items;

    if (summary) {
        summary.textContent = `${reports.length} total`;
    }
}

async function loadLifeSavedHistory() {
    const list = document.getElementById("lifeHistoryList");
    if (!list) return;

    if (!lifeOS.user) {
        renderLifeHistory([]);
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/reports`, {
            credentials: "include"
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Unable to load life history.");
        }

        renderLifeHistory(result.reports || []);
    } catch (error) {
        console.warn("Life history could not be loaded:", error.message);
        list.innerHTML = '<div class="history-empty">History unavailable right now.</div>';
    }
}
