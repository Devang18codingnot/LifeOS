const API_BASE_URL = window.location.protocol === "file:"
    ? "http://127.0.0.1:5000/api"
    : window.location.port === "5500"
        ? `${window.location.protocol}//${window.location.hostname}:5000/api`
        : `${window.location.origin}/api`;

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatDate(value) {
    if (!value) return "Unknown time";
    return new Date(value).toLocaleString();
}

function safeAudioSource(value) {
    return typeof value === "string" && /^data:audio\/(webm|ogg|wav|mpeg);base64,/i.test(value)
        ? value
        : null;
}

function renderAuthorityReports(reports) {
    const container = document.getElementById("authorityReports");
    if (!container) return;

    if (!reports.length) {
        updateAuthorityMetrics([]);
        container.innerHTML = '<div class="authority-empty">No emergency reports have been submitted.</div>';
        return;
    }

    updateAuthorityMetrics(reports);

    container.innerHTML = reports.map((report) => {
        const audioSource = safeAudioSource(report.audioDataUrl);
        const audio = audioSource
            ? `<audio class="authority-report__audio" controls preload="metadata" src="${escapeHtml(audioSource)}"></audio>`
            : "";

        const statusLabels = {
            patient_safe: "Patient safe",
            not_safe: "Not safe",
            in_danger: "In danger",
            about_to_be_in_treatment: "About to be in treatment",
            active: "Awaiting confirmation"
        };
        const currentStatus = report.status || "active";
        const patientDetails = report.patient_details || {};

        return `
        <article class="authority-report">
            <div class="authority-report__topline">
                <strong>${escapeHtml(report.type || report.emergencyType || "Emergency")}</strong>
                <span>${escapeHtml(statusLabels[currentStatus] || currentStatus)}</span>
            </div>
            <p>${escapeHtml(report.voiceTranscript || report.symptoms || report.description || "No description provided.")}</p>
            <small>Source: ${escapeHtml(report.inputMethod === "voice" ? "Voice input" : "Typed input")}</small>
            ${audio}
            <small>${escapeHtml(formatDate(report.created_at))}</small>
            <small>Location: ${escapeHtml(report.locationLabel || report.location?.label || "Not provided")}</small>
            <small>Report ID: ${escapeHtml(report._id || "Unknown")}</small>
            <div class="authority-patient-details">
                <strong>Patient details</strong>
                <label>Name<input id="patient-name-${escapeHtml(report._id || "")}" value="${escapeHtml(patientDetails.name || "")}" maxlength="120" placeholder="Patient name"></label>
                <label>Condition<input id="patient-condition-${escapeHtml(report._id || "")}" value="${escapeHtml(patientDetails.condition || "")}" maxlength="500" placeholder="Current condition"></label>
                <label>Authority notes<textarea id="authority-notes-${escapeHtml(report._id || "")}" maxlength="1000" placeholder="Treatment or safety notes">${escapeHtml(patientDetails.notes || "")}</textarea></label>
            </div>
            <label class="authority-status-control">
                Confirm patient status
                <select onchange="updateReportStatus('${escapeHtml(report._id || "")}', this.value)">
                    <option value="active" ${currentStatus === "active" ? "selected" : ""}>Awaiting confirmation</option>
                    <option value="patient_safe" ${currentStatus === "patient_safe" ? "selected" : ""}>Patient safe</option>
                    <option value="not_safe" ${currentStatus === "not_safe" ? "selected" : ""}>Not safe</option>
                    <option value="in_danger" ${currentStatus === "in_danger" ? "selected" : ""}>In danger</option>
                    <option value="about_to_be_in_treatment" ${currentStatus === "about_to_be_in_treatment" ? "selected" : ""}>About to be in treatment</option>
                </select>
                <button class="authority-save-details" type="button" onclick="savePatientDetails('${escapeHtml(report._id || "")}')">Save patient details</button>
            </label>
        </article>
        `;
    }).join("");
}

function updateAuthorityMetrics(reports) {
    const counts = {
        in_danger: 0,
        about_to_be_in_treatment: 0,
        patient_safe: 0,
        pending: 0
    };

    reports.forEach((report) => {
        if (report.status === "in_danger") counts.in_danger += 1;
        else if (report.status === "about_to_be_in_treatment") counts.about_to_be_in_treatment += 1;
        else if (report.status === "patient_safe") counts.patient_safe += 1;
        else counts.pending += 1;
    });

    document.getElementById("authorityDangerCount").textContent = counts.in_danger;
    document.getElementById("authorityTreatmentCount").textContent = counts.about_to_be_in_treatment;
    document.getElementById("authoritySafeCount").textContent = counts.patient_safe;
    document.getElementById("authorityPendingCount").textContent = counts.pending;
}

async function updateReportStatus(reportId, status) {
    if (!reportId || status === "active") return;

    try {
        const getValue = (id) => document.getElementById(id)?.value || "";
        const response = await fetch(`${API_BASE_URL}/authority/reports/${encodeURIComponent(reportId)}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                status,
                patientName: getValue(`patient-name-${reportId}`),
                patientCondition: getValue(`patient-condition-${reportId}`),
                authorityNotes: getValue(`authority-notes-${reportId}`)
            })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to update report status.");
        await loadAuthorityReports();
    } catch (error) {
        const statusElement = document.getElementById("authorityStatus");
        if (statusElement) statusElement.textContent = error.message;
    }
}

async function savePatientDetails(reportId) {
    const select = document.querySelector(`select[onchange*="${reportId}"]`);
    const status = select?.value || "active";
    if (status === "active") {
        const statusElement = document.getElementById("authorityStatus");
        if (statusElement) statusElement.textContent = "Choose a patient status before saving details.";
        return;
    }
    await updateReportStatus(reportId, status);
}

async function loadAuthorityReports() {
    const status = document.getElementById("authorityStatus");
    if (status) status.textContent = "Loading reports...";

    try {
        const response = await fetch(`${API_BASE_URL}/authority/reports`, {
            credentials: "include"
        });
        const result = await response.json();
        if (response.status === 401) {
            window.location.href = "/login";
            return;
        }
        if (!response.ok) throw new Error(result.error || "Unable to load authority reports.");

        renderAuthorityReports(result.reports || []);
        if (status) status.textContent = `${(result.reports || []).length} report(s) loaded.`;
    } catch (error) {
        if (status) status.textContent = error.message;
    }
}

async function logoutAuthority() {
    await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        credentials: "include"
    });
    window.location.href = "/login";
}

loadAuthorityReports();
