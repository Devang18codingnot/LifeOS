document.addEventListener("click", () => closeAccountMenu());
document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeAccountMenu(); });
window.addEventListener("load", () => { loadLifeSavedHistory(); });
updateTopbarAuth();
updateConnectionStatus();
console.log("LifeOS initialized successfully.");
checkSession();
