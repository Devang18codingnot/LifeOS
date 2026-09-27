function updateConnectionStatus() {
    const systemStatusPill = document.getElementById("systemStatusPill");
    const offlineStatus = document.getElementById("offlineStatus");

    if (!systemStatusPill || !offlineStatus) return;

    const isOnline = navigator.onLine;

    if (isOnline) {
        systemStatusPill.innerHTML = '<span class="status-dot"></span> System Ready';
        offlineStatus.style.display = "none";
    } else {
        systemStatusPill.innerHTML = '<span class="status-dot" style="background:#f87171;"></span> Offline';
        offlineStatus.style.display = "inline-flex";
    }

    const queued = JSON.parse(localStorage.getItem(queuedReportsKey()) || "[]");
    if (!isOnline && queued.length > 0) {
        offlineStatus.textContent = `Offline mode · ${queued.length} report${queued.length > 1 ? "s" : ""} queued`;
    } else if (!isOnline) {
        offlineStatus.textContent = "Offline mode";
    } else {
        offlineStatus.textContent = "Offline mode";
    }
}

async function saveEmergencyReport() {

    const report = {
        emergencyType: lifeOS.emergencyType || "Emergency",
        description: lifeOS.description,
        voiceTranscript: lifeOS.voiceTranscript || null,
        inputMethod: lifeOS.inputMethod,
        audioDataUrl: lifeOS.audioDataUrl || null,
        location: lifeOS.location,
        locationLabel: lifeOS.locationLabel || null,
        photoUrl: null
    };

    if (!navigator.onLine) {
        queueReport(report);
        return;
    }

    try {

        const response = await fetch(`${API_BASE_URL}/reports`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify(report)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "The report could not be saved.");
        }

        lifeOS.reportId = result.reportId || result.report?._id || null;

        console.log("Emergency report saved:", lifeOS.reportId);

    }

    catch (error) {

        // The UI continues to provide immediate guidance even if the local
        // server is not running or Atlas has not been configured yet.
        console.warn("Emergency report was not saved:", error.message);
        queueReport(report);

    }

}

function queuedReportsKey() {
    return `lifeos:queued-reports:${lifeOS.user ? lifeOS.user.id : "guest"}`;
}

function queueReport(report) {
    const queued = JSON.parse(localStorage.getItem(queuedReportsKey()) || "[]");
    queued.push({ ...report, queuedAt: new Date().toISOString() });
    localStorage.setItem(queuedReportsKey(), JSON.stringify(queued));
    updateConnectionStatus();
    console.info("Report queued locally until the connection returns.");
}

async function syncQueuedReports() {
    if (!lifeOS.user || !navigator.onLine) return;
    const queued = JSON.parse(localStorage.getItem(queuedReportsKey()) || "[]");
    if (!queued.length) return;

    const remaining = [];
    for (const report of queued) {
        try {
            const response = await fetch(`${API_BASE_URL}/reports`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(report)
            });
            if (!response.ok) remaining.push(report);
        } catch (error) {
            remaining.push(report);
        }
    }
    localStorage.setItem(queuedReportsKey(), JSON.stringify(remaining));
    updateConnectionStatus();
}

window.addEventListener("online", () => { updateConnectionStatus(); syncQueuedReports(); });
window.addEventListener("offline", updateConnectionStatus);
