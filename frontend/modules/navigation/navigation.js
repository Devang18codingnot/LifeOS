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

function cancelAnalysis() {

    analysisRequestId += 1;
    clearAnalysisTimers();
    showScreen("reportScreen");

}

function clearAnalysisTimers() {

    analysisTimers.forEach(timer => clearTimeout(timer));
    analysisTimers = [];

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

function photoSelected() {

    const input = document.getElementById("photoInput");
    if (!input || !input.files || input.files.length === 0) return;

    const selectedFile = input.files[0];
    if (!selectedFile || !selectedFile.type.startsWith("image/")) {
        alert("Please choose a valid image file for the emergency scene.");
        input.value = "";
        return;
    }

    lifeOS.photoAdded = true;

    const uploadButton = document.querySelector(".photo-upload");
    if (uploadButton) {
        uploadButton.style.borderColor = "rgba(53, 213, 138, 0.35)";

        const title = uploadButton.querySelector("strong");
        if (title) title.textContent = selectedFile.name;

        const copy = uploadButton.querySelector(".photo-upload__copy span");
        if (copy) copy.textContent = "Photo added successfully";
    }

    input.value = "";
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

const textarea = document.getElementById("emergencyDescription");
if (textarea) textarea.addEventListener("input", updateCharacterCount);
