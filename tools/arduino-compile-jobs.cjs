"use strict";
/**
 * Compilation Arduino en arrière-plan — évite le timeout HTTP Render (~30 s).
 */
const { compileArduinoSketch } = require("./arduino-api.cjs");

const JOB_TTL_MS = 15 * 60 * 1000;
const jobs = new Map();
let nextJobId = 1;

function pruneOldJobs() {
    const now = Date.now();
    for (const [id, job] of jobs) {
        if (now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
    }
}

/**
 * @param {{ sketch: string; sketchName?: string; fqbn?: string }} opts
 * @returns {string}
 */
function startCompileJob(opts) {
    pruneOldJobs();
    const jobId = String(nextJobId++);
    const job = {
        status: "pending",
        createdAt: Date.now(),
        fqbn: opts?.fqbn || null,
        result: null,
    };
    jobs.set(jobId, job);

    compileArduinoSketch(opts)
        .then((result) => {
            job.status = "done";
            job.result = result;
        })
        .catch((err) => {
            job.status = "error";
            job.result = {
                ok: false,
                errors: [err?.message || String(err)],
                log: "",
            };
        });

    return jobId;
}

function getCompileJob(jobId) {
    const job = jobs.get(String(jobId || ""));
    if (!job) return null;
    return job;
}

module.exports = { startCompileJob, getCompileJob };
