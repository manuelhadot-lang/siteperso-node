/**
 * Générateur de formes d'onde I²C (UM10204 mode standard 100 kHz).
 * Modèle push-pull avec niveaux bus haut = 5 V (tireur relâché + pull-up), bas = 0 V.
 */

export const I2C_V_HIGH = 5;
export const I2C_V_LOW = 0;
/** Mode standard 100 kHz — t_LOW / t_HIGH ≥ 4,7 µs. */
export const I2C_SCL_HZ = 100_000;
export const I2C_SCL_PERIOD_SEC = 1 / I2C_SCL_HZ;
export const I2C_T_LOW = 4.7e-6;
export const I2C_T_HIGH = 4.0e-6;
export const I2C_T_SU_STA = 4.7e-6;
export const I2C_T_HD_STA = 4.0e-6;
export const I2C_T_SU_STO = 4.0e-6;
export const I2C_T_BUF = 4.7e-6;
export const I2C_T_SU_DAT = 0.25e-6;
export const I2C_T_RISE = 50e-9;

export function formatSpiceTime(seconds) {
    const s = Math.abs(Number(seconds));
    if (!Number.isFinite(s)) return "1n";
    if (s === 0) return "0";
    if (s >= 1) return String(s);
    if (s >= 1e-3) return `${(s * 1e3).toPrecision(6)}m`;
    if (s >= 1e-6) return `${(s * 1e6).toPrecision(6)}u`;
    if (s >= 1e-9) return `${(s * 1e9).toPrecision(6)}n`;
    return `${s.toExponential(3)}`;
}

function coalescePwl(points) {
    if (!points.length) return [[0, I2C_V_HIGH]];
    const out = [[points[0][0], points[0][1]]];
    for (let i = 1; i < points.length; i++) {
        const [t, v] = points[i];
        const prev = out[out.length - 1];
        if (Math.abs(t - prev[0]) < 1e-15 && Math.abs(v - prev[1]) < 1e-9) continue;
        if (Math.abs(v - prev[1]) < 1e-9 && t > prev[0]) {
            prev[0] = t;
            continue;
        }
        out.push([t, v]);
    }
    return out;
}

/** Émetteur maître I²C — construction SDA/SCL synchrones. */
export class I2cMasterWaveform {
    constructor() {
        this.t = 0;
        this.scl = I2C_V_HIGH;
        this.sda = I2C_V_HIGH;
        /** @type {[number, number][]} */
        this.sdaPoints = [[0, I2C_V_HIGH]];
        /** @type {[number, number][]} */
        this.sclPoints = [[0, I2C_V_HIGH]];
    }

    durationSec() {
        return this.t;
    }

    _snapshot() {
        this.sdaPoints.push([this.t, this.sda]);
        this.sclPoints.push([this.t, this.scl]);
    }

    _setSda(v) {
        if (Math.abs(this.sda - v) > 1e-9) {
            this.sda = v;
            this._snapshot();
        }
    }

    _setScl(v) {
        if (Math.abs(this.scl - v) > 1e-9) {
            this.scl = v;
            this._snapshot();
        }
    }

    _wait(dt) {
        this.t += dt;
    }

    /** Condition START (t_HD;STA). */
    start() {
        this._setSda(I2C_V_HIGH);
        this._setScl(I2C_V_HIGH);
        this._wait(I2C_T_SU_STA);
        this._setSda(I2C_V_LOW);
        this._wait(I2C_T_HD_STA);
        this._setScl(I2C_V_LOW);
        this._wait(I2C_T_RISE);
    }

    /** Condition STOP (t_SU;STO). */
    stop() {
        this._setSda(I2C_V_LOW);
        this._setScl(I2C_V_LOW);
        this._wait(I2C_T_RISE);
        this._setScl(I2C_V_HIGH);
        this._wait(I2C_T_SU_STO);
        this._setSda(I2C_V_HIGH);
        this._wait(I2C_T_BUF);
    }

    /** Un bit de données (MSB→LSB), horloge 100 kHz. */
    _writeBit(bit) {
        this._setScl(I2C_V_LOW);
        this._setSda(bit ? I2C_V_HIGH : I2C_V_LOW);
        this._wait(I2C_T_SU_DAT);
        this._setScl(I2C_V_HIGH);
        this._wait(I2C_T_HIGH);
        this._setScl(I2C_V_LOW);
        this._wait(I2C_T_LOW);
    }

    /** Octet + créneau ACK (esclave tire SDA à 0). */
    writeByte(byte) {
        for (let i = 7; i >= 0; i--) {
            this._writeBit((byte >> i) & 1);
        }
        this._setScl(I2C_V_LOW);
        this._setSda(I2C_V_HIGH);
        this._wait(I2C_T_SU_DAT);
        this._setScl(I2C_V_HIGH);
        this._wait(I2C_T_HIGH);
        this._setSda(I2C_V_LOW);
        this._setScl(I2C_V_LOW);
        this._wait(I2C_T_LOW);
    }

    /** Transaction WRITE : START + adresse 8 bits (7b+R/W) + ACK + [data+ACK]* + STOP. */
    writeTransaction(addr8, dataBytes = []) {
        this.start();
        this.writeByte(addr8 & 0xff);
        for (const b of dataBytes) {
            this.writeByte(b & 0xff);
        }
        this.stop();
    }

    toPwl() {
        return {
            sda: coalescePwl(this.sdaPoints),
            scl: coalescePwl(this.sclPoints),
            durationSec: this.t,
        };
    }
}

/**
 * Répète une forme d'onde pour remplir la fenêtre SPICE.
 * @param {{ sda: [number,number][], scl: [number,number][], durationSec: number }} once
 * @param {number} repeatUntilSec
 */
export function repeatI2cWaveform(once, repeatUntilSec) {
    const dur = Math.max(once.durationSec, 1e-9);
    const target = Math.max(repeatUntilSec, dur);
    const sda = [...once.sda];
    const scl = [...once.scl];
    let t = dur;
    while (t + dur <= target + 1e-12) {
        const offset = t;
        for (let i = 1; i < once.sda.length; i++) {
            sda.push([once.sda[i][0] + offset, once.sda[i][1]]);
        }
        for (let i = 1; i < once.scl.length; i++) {
            scl.push([once.scl[i][0] + offset, once.scl[i][1]]);
        }
        t += dur + I2C_T_BUF;
    }
    return {
        sda: coalescePwl(sda),
        scl: coalescePwl(scl),
        durationSec: t,
    };
}

/**
 * ngspice interpole linéairement entre points PWL : chaque palier doit être
 * (t_début, V) puis (t_fin, V) avant un saut, sinon la tension « rampe » sur toute la durée du palier.
 */
export function expandPwlPlateaus(points) {
    if (!points.length) return [[0, I2C_V_HIGH]];
    const out = [[points[0][0], points[0][1]]];
    for (let i = 1; i < points.length; i++) {
        const [t, v] = points[i];
        const [tPrev, vPrev] = points[i - 1];
        if (Math.abs(v - vPrev) > 1e-9) {
            if (t > tPrev + 1e-18) out.push([t, vPrev]);
            out.push([t, v]);
        } else if (t > tPrev + 1e-18) {
            out.push([t, v]);
        }
    }
    return out;
}

/** PWL ngspice : PWL(t1 v1 t2 v2 …). */
export function pwlToSpiceString(points) {
    const parts = [];
    for (const [t, v] of expandPwlPlateaus(points)) {
        parts.push(formatSpiceTime(t), String(v));
    }
    return `PWL(${parts.join(" ")})`;
}

/**
 * Adresse 8 bits sur le bus (7 bits + R/W=0 pour écriture).
 * LiquidCrystal_I2C(0x3E) Grove : octet d'adresse = 0x3E.
 */
export function i2cWriteAddress8From7bit(addr7) {
    return ((addr7 & 0x7f) << 1) & 0xfe;
}

export function groveLcdBusAddress8(addrFromSketch) {
    const a = addrFromSketch & 0xff;
    if (a >= 0x80) return a;
    if (a <= 0x7f && (a & 1) === 0 && a >= 0x20) return a;
    return i2cWriteAddress8From7bit(a);
}
