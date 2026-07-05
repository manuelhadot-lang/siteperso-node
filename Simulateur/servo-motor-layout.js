/** Géométrie servo moteur — 3 broches (− / + / signal), palonnier orientable. */
const G = 20;

export const SERVO_MOTOR_LEAD = 40;
export const SERVO_JUNC_L = -SERVO_MOTOR_LEAD;
export const SERVO_JUNC_R = SERVO_MOTOR_LEAD;
/** Corps aligné sur la grille (pas entier 20 px). */
export const SERVO_BODY_W = 2 * G;
export const SERVO_BODY_H = 2 * G;

/** Broches sur pas de grille entier (±20 px) — jonctions calées si le centre l’est. */
export const SERVO_PIN_PLUS_Y = -G;
export const SERVO_PIN_MINUS_Y = G;
export const SERVO_PIN_SIGNAL_Y = 0;

export function servoMotorJonctionToTerminalKey(label, jonctionId) {
    if (!label || !jonctionId?.startsWith(`${label}_`)) return null;
    const suffix = jonctionId.slice(label.length + 1);
    if (suffix === "minus") return `${label}#0`;
    if (suffix === "plus") return `${label}#1`;
    if (suffix === "signal") return `${label}#2`;
    return null;
}

export function servoMotorJonctions(label) {
    return [
        { id: `${label}_minus`, x: SERVO_JUNC_L, y: SERVO_PIN_MINUS_Y },
        { id: `${label}_plus`, x: SERVO_JUNC_L, y: SERVO_PIN_PLUS_Y },
        { id: `${label}_signal`, x: SERVO_JUNC_R, y: SERVO_PIN_SIGNAL_Y },
    ];
}
