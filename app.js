

const lifeOS = {
    user: null,
    emergencyType: "",
    description: "",
    photoAdded: false,
    reportId: null,
    location: null,
    locationLabel: "",

    priority: "HIGH",
    mainAction: "Call emergency services",
    nextAction: "Check whether the person is breathing."
};

function resetLocationState() {
    lifeOS.location = null;
    lifeOS.locationLabel = "";

    const status = document.getElementById("locationStatusText");
    const coords = document.getElementById("locationCoordinates");
    const mapWrap = document.getElementById("locationMapWrap");
    const mapFrame = document.getElementById("locationMapFrame");

    if (status) status.textContent = "Location unavailable";
    if (coords) {
        coords.textContent = "Tap to detect your current position";
        coords.style.display = "block";
    }
    if (mapWrap) mapWrap.style.display = "none";
    if (mapFrame) {
        mapFrame.style.display = "none";
        mapFrame.src = "";
    }
}

let analysisTimers = [];
let analysisRequestId = 0;

// Use the same origin when Flask serves the website. For Live Server on port
// 5500, route API calls to the Flask server on port 5000 instead.
const API_BASE_URL = window.location.protocol === "file:"
    ? "http://127.0.0.1:5000/api"
    : window.location.port === "5500"
        ? `${window.location.protocol}//${window.location.hostname}:5000/api`
        : `${window.location.origin}/api`;

function updateTopbarAuth() {
    const profileButton = document.getElementById("profileButton");
    const authActionButton = document.getElementById("authActionButton");

    if (!profileButton || !authActionButton) return;

    if (lifeOS.user) {
        profileButton.style.display = "inline-flex";
        authActionButton.textContent = "⇥";
        authActionButton.setAttribute("aria-label", "Log out");
        authActionButton.title = "Log out";
        authActionButton.onclick = logout;
    } else {
        profileButton.style.display = "none";
        authActionButton.textContent = "Log in";
        authActionButton.setAttribute("aria-label", "Log in");
        authActionButton.title = "Log in";
        authActionButton.onclick = () => window.location.href = "/login";
    }
}

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

function openProfile() {
    showScreen("profileScreen");
    loadProfile();
}

function openLifeSavedHistory() {
    showScreen("historyScreen");
    loadLifeSavedHistory();
}

async function loadProfile() {
    try {
        const response = await fetch(`${API_BASE_URL}/profile`, { credentials: "include" });
        const profile = await response.json();
        if (!response.ok) throw new Error(profile.error || "Could not load profile.");
        const form = document.getElementById("profileForm");
        Object.entries(profile).forEach(([field, value]) => {
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

async function logout() {
    try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
            method: "POST",
            credentials: "include"
        });
    } finally {
        lifeOS.user = null;
        updateTopbarAuth();
        window.location.href = "/login";
    }
}


/* =========================================
   SCREEN MANAGEMENT
========================================= */

function showScreen(screenId) {

    const screens = document.querySelectorAll(".screen");

    screens.forEach(screen => {
        screen.classList.remove("active");
    });

    const selectedScreen = document.getElementById(screenId);

    if (selectedScreen) {
        selectedScreen.classList.add("active");
    }

    window.scrollTo({
        top: 0,
        behavior: "instant"
    });
}


/* =========================================
   SCREEN 1
   SELECT EMERGENCY
========================================= */

function selectEmergency(type) {

    lifeOS.emergencyType = type;

    document.getElementById("reportTitle").textContent = type;

    showScreen("reportScreen");
    getCurrentLocation(true);

    console.log("Emergency selected:", type);
}


/* =========================================
   GO HOME
========================================= */

function goHome() {

    analysisRequestId += 1;
    clearAnalysisTimers();

    if (lifeOS.user) {
        showScreen("homeScreen");
        loadLifeSavedHistory();
    } else {
        window.location.href = "/login";
        return;
    }

    lifeOS.emergencyType = "";
    lifeOS.description = "";
    lifeOS.photoAdded = false;
    lifeOS.reportId = null;
    resetLocationState();

    const textarea =
        document.getElementById("emergencyDescription");

    if (textarea) {
        textarea.value = "";
    }

    updateCharacterCount();
}

window.addEventListener("load", () => {
    loadLifeSavedHistory();
});

function cancelAnalysis() {

    analysisRequestId += 1;
    clearAnalysisTimers();
    showScreen("reportScreen");

}

function clearAnalysisTimers() {

    analysisTimers.forEach(timer => clearTimeout(timer));
    analysisTimers = [];

}


/* =========================================
   CHARACTER COUNTER
========================================= */

const textarea =
    document.getElementById("emergencyDescription");

if (textarea) {

    textarea.addEventListener("input", updateCharacterCount);

}

function updateCharacterCount() {

    const input =
        document.getElementById("emergencyDescription");

    const counter =
        document.getElementById("characterCount");

    if (!input || !counter) return;

    counter.textContent =
        `${input.value.length} / 500`;
}


/* =========================================
   PHOTO SELECTION
========================================= */

function photoSelected() {

    const input =
        document.getElementById("photoInput");

    if (input.files.length > 0) {

        lifeOS.photoAdded = true;

        const uploadButton =
            document.querySelector(".photo-upload");

        uploadButton.style.borderColor =
            "rgba(53, 213, 138, 0.35)";

        uploadButton.querySelector("strong").textContent =
            input.files[0].name;

        uploadButton.querySelector("span:not(.arrow)").textContent =
            "Photo added successfully";

    }

}

async function getCurrentLocation(silent = false) {
    const status = document.getElementById("locationStatusText");
    const coordinates = document.getElementById("locationCoordinates");
    const mapFrame = document.getElementById("locationMapFrame");
    const mapWrap = document.getElementById("locationMapWrap");

    if (!navigator.geolocation) {
        if (status) status.textContent = "Geolocation unavailable in this browser.";
        return;
    }

    if (status && !silent) status.textContent = "Detecting your location...";
    if (status && silent) status.textContent = "Using your current location...";

    navigator.geolocation.getCurrentPosition(async (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        lifeOS.location = {
            latitude,
            longitude,
            accuracy: position.coords.accuracy || null
        };

        if (coordinates) {
            coordinates.textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        }

        if (mapFrame && mapWrap) {
            const bbox = `${longitude - 0.01},${latitude - 0.01},${longitude + 0.01},${latitude + 0.01}`;
            mapFrame.src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude},${longitude}`;
            mapFrame.style.display = "block";
            mapWrap.style.display = "block";
        }

        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=jsonv2&zoom=18`,
                {
                    headers: {
                        "Accept-Language": "en"
                    }
                }
            );

            const data = await response.json();
            const placeName = data.display_name || "Nearby location";
            lifeOS.locationLabel = placeName;
            if (status) status.textContent = "Location detected";
            if (coordinates) {
                coordinates.textContent = placeName;
                coordinates.style.display = "block";
            }
            console.log("Location resolved:", placeName);
        } catch (error) {
            if (status) status.textContent = "Location detected";
            if (coordinates) {
                coordinates.textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
            }
            console.warn("Reverse geocoding failed:", error.message);
        }
    }, (error) => {
        if (status) {
            status.textContent = "Location unavailable";
        }
        if (coordinates) {
            coordinates.textContent = "You can still continue without it";
        }
        console.warn("Geolocation error:", error.message);
    }, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000
    });
}


/* =========================================
   VOICE INPUT
========================================= */

function voiceInput() {

    /*
        This is a prototype placeholder.

        Later we can connect this button to:
        - Web Speech API
        - Whisper
        - Another speech-to-text service
    */

    if (!("webkitSpeechRecognition" in window)) {

        alert(
            "Voice input is not supported in this browser. " +
            "Please type the emergency description."
        );

        return;
    }


    const recognition =
        new webkitSpeechRecognition();

    recognition.lang = "en-IN";

    recognition.continuous = false;

    recognition.interimResults = false;


    recognition.onstart = function () {

        console.log("Voice recognition started.");

    };


    recognition.onresult = function (event) {

        const speech =
            event.results[0][0].transcript;

        document.getElementById(
            "emergencyDescription"
        ).value = speech;

        updateCharacterCount();

    };


    recognition.onerror = function (event) {

        console.error(
            "Voice recognition error:",
            event.error
        );

    };


    recognition.start();

}


/* =========================================
   ANALYZE EMERGENCY
========================================= */

async function analyzeEmergency() {

    const description =
        document
            .getElementById("emergencyDescription")
            .value
            .trim();


    if (description.length < 10) {
        alert("Please add a short description of at least 10 characters before analyzing.");
        document.getElementById("emergencyDescription").focus();
        return;
    }

    lifeOS.description = description;

    // Store the report in MongoDB through the Flask API. This is deliberately
    // non-blocking so a temporary connection problem does not delay emergency
    // guidance on screen.
    saveEmergencyReport();


    showScreen("analysisScreen");
    runAnalysisAnimation();

    const requestId = ++analysisRequestId;
    const guidance = await requestEmergencyAnalysis();

    if (requestId !== analysisRequestId) return;

    if (guidance) {
        clearAnalysisTimers();
        generatePriorityResult(guidance);
    }

}

/* =========================================
   BACKEND / MONGODB REPORT STORAGE
========================================= */

async function saveEmergencyReport() {

    const report = {
        emergencyType: lifeOS.emergencyType || "Emergency",
        description: lifeOS.description,
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

        lifeOS.reportId = result.reportId;

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

window.addEventListener("online", () => {
    updateConnectionStatus();
    syncQueuedReports();
});
window.addEventListener("offline", updateConnectionStatus);

updateTopbarAuth();
updateConnectionStatus();

function normalizeAnalysisResult(result) {
    const riskLevel = (result && result.risk_level) || "low";
    const emergencyServices = Boolean(result && result.emergency_services);
    const recommendedAction = (result && result.recommended_action) || "No emergency detected based on the provided information.";
    const summary = (result && result.summary) || "No emergency detected.";

    const normalized = {
        priority: emergencyServices ? "HIGH" : "LOW",
        mainAction: emergencyServices
            ? "Call local emergency services"
            : "No emergency response required based on this report",
        nextAction: emergencyServices
            ? recommendedAction
            : "Continue to monitor the scene and contact help only if the situation changes.",
        actionDescription: emergencyServices
            ? summary
            : "The image and description do not show an accident, injury, or emergency."
    };

    if (riskLevel === "critical" || riskLevel === "high") {
        normalized.priority = "HIGH";
    } else if (riskLevel === "medium") {
        normalized.priority = "MEDIUM";
    }

    return normalized;
}

async function requestEmergencyAnalysis() {

    try {
        const photoInput = document.getElementById("photoInput");
        const selectedFile = photoInput && photoInput.files && photoInput.files[0]
            ? photoInput.files[0]
            : null;

        let imageData = null;
        let imageMimeType = null;

        if (selectedFile) {
            imageMimeType = selectedFile.type || "image/jpeg";
            imageData = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error("The uploaded image could not be read."));
                reader.readAsDataURL(selectedFile);
            });
        }

        const response = await fetch(`${API_BASE_URL}/analyze`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
                emergencyType: lifeOS.emergencyType || "Emergency",
                description: lifeOS.description,
                symptoms: lifeOS.description,
                image: imageData,
                image_mime_type: imageMimeType
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "AI analysis could not be completed.");
        }

        if (result && result.analysis && typeof result.analysis === "object") {
            return normalizeAnalysisResult(result.analysis);
        }

        return normalizeAnalysisResult(result);

    }

    catch (error) {

        const status = document.querySelector(".analyzing-text");

        if (status) {
            status.textContent = `ANALYSIS UNAVAILABLE: ${error.message}`;
        }

        console.error("AI analysis failed:", error.message);
        return {
            priority: "HIGH",
            mainAction: "Call local emergency services",
            nextAction: "Move to safety and follow the operator's instructions.",
            actionDescription: "Internet-based analysis is unavailable. Use your local emergency number for immediate help."
        };

    }

}


/* =========================================
   AI ANALYSIS ANIMATION
========================================= */

function runAnalysisAnimation() {

    clearAnalysisTimers();

    const status = document.querySelector(".analyzing-text");

    if (status) {
        status.innerHTML = '<span class="loading-dot"></span> ANALYZING...';
    }

    const steps = [
        "analysisStep1",
        "analysisStep2",
        "analysisStep3",
        "analysisStep4"
    ];


    steps.forEach((id, index) => {

        const step =
            document.getElementById(id);

        step.classList.remove("completed");

        step.querySelector(".step-status").textContent = "○";

        const stepTimer = setTimeout(() => {

            step.classList.add("completed");

            step.querySelector(".step-status").textContent = "✓";

        }, 700 * (index + 1));

        analysisTimers.push(stepTimer);

    });


}


/* =========================================
   GENERATE PRIORITY RESULT
========================================= */

function generatePriorityResult(guidance) {

    const type = lifeOS.emergencyType || "Emergency";

    lifeOS.priority = guidance.priority;
    lifeOS.mainAction = guidance.mainAction;
    lifeOS.nextAction = guidance.nextAction;

    document.getElementById("priorityType").textContent = type.toUpperCase();
    document.getElementById("mainAction").textContent = lifeOS.mainAction;
    document.getElementById("nextAction").textContent = lifeOS.nextAction;
    document.getElementById("actionDescription").textContent = guidance.actionDescription;
    document.querySelector(".priority-badge").textContent = `${lifeOS.priority} PRIORITY`;

    showScreen("priorityScreen");

}


/* =========================================
   ACTION DESCRIPTION
========================================= */

function getActionDescription(type) {

    switch (type) {

        case "Fire":
            return "Move away from immediate danger and get to a safe location.";

        case "Medical Emergency":
            return "Professional emergency assistance should be contacted as quickly as possible.";

        case "Injury":
            return "Get professional emergency assistance and keep the injured person safe.";

        case "Other Emergency":
            return "Move away from immediate danger and contact appropriate emergency services.";

        default:
            return "Get professional emergency assistance as quickly as possible.";
    }

}


/* =========================================
   CALL EMERGENCY
========================================= */

function callEmergency() {

    /*
        For the prototype we use the
        phone tel protocol.

        On a real supported device this
        can initiate the emergency call.
    */

    const confirmed =
        confirm(
            "Call emergency services now?"
        );


    if (!confirmed) return;


    window.location.href =
        "tel:112";

}


/* =========================================
   DEBUG HELPER
========================================= */

console.log(
    "LifeOS initialized successfully."
);

checkSession();
