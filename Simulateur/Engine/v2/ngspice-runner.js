import { execFile } from "node:child_process";

export function runNgspice(netlistPath, outputPath) {
    return new Promise((resolve, reject) => {
        execFile(
            "ngspice",
            ["-b", "-o", outputPath, netlistPath],
            { windowsHide: true, timeout: 25000, maxBuffer: 8 * 1024 * 1024 },
            (error, stdout, stderr) => {
                if (error) {
                    reject({
                        message: error.message,
                        code: error.code,
                        stdout: stdout || "",
                        stderr: stderr || ""
                    });
                    return;
                }
                resolve({ stdout: stdout || "", stderr: stderr || "" });
            }
        );
    });
}
