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
