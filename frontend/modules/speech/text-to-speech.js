function speakText(text, options = {}) {
    if (!("speechSynthesis" in window)) return false;
    const message = String(text || "").trim();
    if (!message) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = options.lang || "en-IN";
    utterance.rate = Number.isFinite(options.rate) ? options.rate : 1;
    utterance.pitch = Number.isFinite(options.pitch) ? options.pitch : 1;
    utterance.volume = Number.isFinite(options.volume) ? options.volume : 1;
    window.speechSynthesis.speak(utterance);
    return true;
}

function stopSpeaking() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}
