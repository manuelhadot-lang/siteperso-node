/** Géométrie moteur DC — 2 bornes (+ / −), corps rotatif. */
const G = 20;

export const DC_MOTOR_R = 22;
export const DC_MOTOR_LEAD = 40;

export function dcMotorJonctionToTerminalKey(label, jonctionId) {
    if (!label || !jonctionId?.startsWith(`${label}_`)) return null;
    const suffix = jonctionId.slice(label.length + 1);
    if (suffix === "minus") return `${label}#0`;
    if (suffix === "plus") return `${label}#1`;
    return null;
}
