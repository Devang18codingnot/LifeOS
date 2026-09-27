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
