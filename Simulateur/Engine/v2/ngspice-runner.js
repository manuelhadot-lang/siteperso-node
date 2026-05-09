import { spawn } from "node:child_process";

export function runNgspice(netlistPath, outputPath) {
    return new Promise((resolve, reject) => {
        const child = spawn("ngspice", ["-b", "-o", outputPath, netlistPath], {
            shell: process.platform === "win32",
            windowsHide: true
        });

        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (chunk) => {
            stdout += String(chunk || "");
        });
        child.stderr?.on("data", (chunk) => {
            stderr += String(chunk || "");
        });

        child.on("error", (err) => {
            reject({
                message: err?.message || "ngspice introuvable",
                stdout,
                stderr: stderr + String(err?.message || "")
            });
        });

        child.on("close", (code, signal) => {
            resolve({
                stdout,
                stderr,
                code,
                signal
            });
        });
    });
}
