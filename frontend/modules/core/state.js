

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


