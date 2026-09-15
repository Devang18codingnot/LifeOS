

const lifeOS = {
    user: null,
    emergencyType: "",
    description: "",
    voiceTranscript: "",
    inputMethod: "typed",
    audioDataUrl: null,
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

document.addEventListener("click", () => closeAccountMenu());
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAccountMenu();
});


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
    updateInstantHelp(type);

    showScreen("reportScreen");
    getCurrentLocation(true);

    console.log("Emergency selected:", type);
}

function updateInstantHelp(type) {
    const guidance = {
        Accident: "Move away from traffic if it is safe. Do not move an injured person unless there is immediate danger.",
        "Medical Emergency": "Check that the person is breathing, keep them calm, and avoid giving food or medicine unless instructed.",
        Fire: "Leave immediately, stay low in smoke, and never re-enter the building for belongings.",
        Injury: "Keep the injured person still, apply gentle pressure to serious bleeding, and wait for professional help.",
        "Other Emergency": "Move away from immediate danger, stay with others if safe, and describe the situation to emergency services."
    };

    const helpText = document.getElementById("instantHelpText");
    const helpStatus = document.getElementById("instantHelpStatus");

    if (helpText) {
        helpText.textContent = guidance[type] || guidance["Other Emergency"];
    }
    if (helpStatus) helpStatus.textContent = "Emergency services can help before analysis is complete.";
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
    lifeOS.voiceTranscript = "";
    lifeOS.inputMethod = "typed";
    lifeOS.audioDataUrl = null;
    voiceAudioReady = Promise.resolve();
    lifeOS.photoAdded = false;
    lifeOS.reportId = null;
    resetLocationState();

    const textarea =
        document.getElementById("emergencyDescription");

    if (textarea) {
        textarea.value = "";
    }

    const photoInput = document.getElementById("photoInput");
    const photoPreview = document.getElementById("photoPreview");
    if (photoInput) photoInput.value = "";
    if (photoPreview) {
        photoPreview.src = "";
        photoPreview.hidden = true;
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

        const selectedFile = input.files[0];
        uploadButton.querySelector("strong").textContent = selectedFile.name;

        uploadButton.querySelector("span:not(.arrow)").textContent =
            "Photo added successfully";

        const preview = document.getElementById("photoPreview");
        if (preview) {
            preview.src = URL.createObjectURL(selectedFile);
            preview.hidden = false;
        }

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

let voiceRecognition = null;
let voiceRecognitionActive = false;
let voiceMediaRecorder = null;
let voiceMediaStream = null;
let voiceAudioChunks = [];
let voiceAudioReady = Promise.resolve();
let resolveVoiceAudioReady = () => {};

function setVoiceStatus(message, isError = false) {
    const status = document.getElementById("voiceStatus");
    if (!status) return;

    status.textContent = message;
    status.classList.toggle("error", isError);
}

function setVoiceButtonState(isActive) {
    const button = document.getElementById("voiceButton");
    if (!button) return;

    button.disabled = false;
    button.textContent = isActive ? "Recording..." : "Record voice";
    button.classList.toggle("voice-button--active", isActive);
    button.setAttribute("aria-label", isActive ? "Stop recording" : "Start voice recording");
}

async function voiceInput() {
    if (voiceRecognitionActive) {
        voiceRecognition.stop();
        return;
    }

    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
        setVoiceStatus("Voice input needs HTTPS or localhost. Please type the description.", true);
        return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
        setVoiceStatus("Voice input is not supported here. Please type the description.", true);
        return;
    }

    if (navigator.permissions?.query) {
        try {
            const permission = await navigator.permissions.query({ name: "microphone" });
            if (permission.state === "denied") {
                setVoiceStatus("Microphone permission is blocked. Allow it for this site in Chrome, then try again.", true);
                return;
            }
        } catch (error) {
            console.warn("Microphone permission state could not be checked:", error.message);
        }
    }

    try {
        voiceMediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (window.MediaRecorder) {
            voiceAudioReady = new Promise((resolve) => {
                resolveVoiceAudioReady = resolve;
            });
            const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg"]
                .find((type) => MediaRecorder.isTypeSupported(type));
            const recordingMimeType = mimeType || "audio/webm";
            voiceMediaRecorder = new MediaRecorder(voiceMediaStream, mimeType ? { mimeType } : undefined);
            voiceAudioChunks = [];
            voiceMediaRecorder.ondataavailable = (event) => {
                if (event.data.size) voiceAudioChunks.push(event.data);
            };
            voiceMediaRecorder.onstop = () => {
                const blob = new Blob(voiceAudioChunks, { type: recordingMimeType });
                if (blob.size > 2 * 1024 * 1024) {
                    setVoiceStatus("Audio clip was too large to send. The transcript is still ready.", true);
                    resolveVoiceAudioReady();
                    return;
                }
                const reader = new FileReader();
                reader.onloadend = () => {
                    lifeOS.audioDataUrl = reader.result;
                    setVoiceStatus("Voice audio and transcript are ready to send to the authority.");
                    resolveVoiceAudioReady();
                };
                reader.readAsDataURL(blob);
            };
            voiceMediaRecorder.start();
        }
    } catch (error) {
        resolveVoiceAudioReady();
        voiceMediaStream?.getTracks().forEach((track) => track.stop());
        voiceMediaStream = null;
        setVoiceStatus("Audio recording is unavailable, but transcript input can still be used.", true);
        console.warn("Audio recording could not start:", error.message);
    }

    if (!voiceRecognition) {
        try {
            voiceRecognition = new Recognition();
        } catch (error) {
            setVoiceStatus("Voice input could not start. Please type the description.", true);
            console.error("Voice recognition setup failed:", error);
            return;
        }

        voiceRecognition.lang = "en-IN";
        voiceRecognition.continuous = false;
        voiceRecognition.interimResults = false;

        voiceRecognition.onstart = function () {
            voiceRecognitionActive = true;
            setVoiceButtonState(true);
            setVoiceStatus("Listening... speak clearly, then pause.");
        };

        voiceRecognition.onresult = function (event) {
            const transcript = event.results[0]?.[0]?.transcript?.trim();
            const input = document.getElementById("emergencyDescription");
            if (!transcript || !input) return;

            input.value = input.value.trim()
                ? `${input.value.trim()} ${transcript}`
                : transcript;
            lifeOS.voiceTranscript = transcript;
            lifeOS.inputMethod = "voice";
            updateCharacterCount();
            setVoiceStatus("Voice description added and ready to send to the authority.");
        };

        voiceRecognition.onerror = function (event) {
            const messages = {
                "not-allowed": "Microphone permission was denied. Allow it in Chrome, then try again.",
                "service-not-allowed": "Chrome blocked speech recognition. Check microphone and site permissions.",
                "audio-capture": "No microphone was found. Check your microphone, then try again.",
                "no-speech": "No speech detected. Try again or type the description.",
                "network": "Speech recognition needs a network connection. Please type the description if it fails again.",
                "aborted": "Voice input stopped. You can try again or type the description."
            };
            setVoiceStatus(messages[event.error] || "Voice input failed. Please try again or type the description.", true);
            console.error("Voice recognition error:", event.error);
        };

        voiceRecognition.onend = function () {
            voiceRecognitionActive = false;
            setVoiceButtonState(false);
            if (voiceMediaRecorder && voiceMediaRecorder.state !== "inactive") {
                voiceMediaRecorder.stop();
            }
            voiceMediaRecorder = null;
            voiceMediaStream?.getTracks().forEach((track) => track.stop());
            voiceMediaStream = null;
        };
    }

    try {
        voiceRecognition.start();
    } catch (error) {
        voiceRecognitionActive = false;
        setVoiceButtonState(false);
        if (voiceMediaRecorder && voiceMediaRecorder.state !== "inactive") voiceMediaRecorder.stop();
        voiceMediaStream?.getTracks().forEach((track) => track.stop());
        voiceMediaRecorder = null;
        voiceMediaStream = null;
        setVoiceStatus("Voice input could not start. Check Chrome's microphone permission or type instead.", true);
        console.error("Voice recognition start failed:", error);
    }

}


/* =========================================
   ANALYZE EMERGENCY
========================================= */

async function analyzeEmergency() {

    if (voiceRecognitionActive) voiceRecognition.stop();
    await voiceAudioReady;

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
    const confirmation = document.querySelector(".saved-confirmation");
    if (confirmation) {
        confirmation.querySelector("strong").textContent = "Life saved report sent";
        confirmation.querySelector("span").textContent = lifeOS.reportId
            ? "Authority confirmation: awaiting status update."
            : "The report is ready for emergency responders.";
    }

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

    const confirmed = confirm("Call local emergency services now? Use your area's emergency number if 112 is not available.");


    if (!confirmed) return;


    window.location.href = "tel:112";

}


/* =========================================
   DEBUG HELPER
========================================= */

console.log(
    "LifeOS initialized successfully."
);

checkSession();
