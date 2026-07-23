import { initFullscreenToggle } from "./fullscreen.js";

const workspace = document.getElementById("lab-workspace");
const fullscreenBtn = document.getElementById("btn-fullscreen");

if (workspace && fullscreenBtn) {
    initFullscreenToggle(workspace, fullscreenBtn);
}
