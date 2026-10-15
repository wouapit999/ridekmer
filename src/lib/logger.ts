/**
 * Minimal structured JSON logger with secret and personal-data redaction.
 * Works in Node and Edge runtimes. Replace the sink with an external provider in production
 * by wrapping `emit`.
 */
export type LogLevel = "fatal" | "error" | "warn" | "info" | "debug";

const LEVEL_ORDER: Record<LogLevel, number> = { fatal: 0, error: 1, warn: 2, info: 3, debug: 4 };

const REDACT_KEYS = [
  "password",
  "newpassword",
  "currentpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "secret",
  "apikey",
  "authorization",
  "cookie",
  "otp",
  "code",
  "pin",
  "cvv",
  "cardnumber",
  "pan",
  "backupcodes",
  "identitynumber",
  "drivinglicenceno",
  "licencenumber",
  "vin",
  "accountnumber",
  "iban",
];

const PHONE_PATTERN = /(\+?\d{1,3}[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{3}\b/g;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limit]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.replace(EMAIL_PATTERN, maskEmail).replace(PHONE_PATTERN, maskPhone);
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message, depth + 1), stack: value.stack };
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const normalised = key.toLowerCase().replace(/[_\s-]/g, "");
      out[key] = REDACT_KEYS.some((k) => normalised.includes(k))
        ? "[REDACTED]"
        : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "[email]";
  return `${local.slice(0, 2)}***@${domain}`;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "[phone]";
  return `${"*".repeat(Math.max(0, digits.length - 3))}${digits.slice(-3)}`;
}

function currentLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info") as LogLevel;
  return raw in LEVEL_ORDER ? raw : "info";
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] > LEVEL_ORDER[currentLevel()]) return;
  const entry = {
    level,
    time: new Date().toISOString(),
    msg: message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  };
  const line = JSON.stringify(entry);
  if (level === "fatal" || level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  fatal: (msg: string, ctx?: Record<string, unknown>) => emit("fatal", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  child: (base: Record<string, unknown>) => ({
    fatal: (msg: string, ctx?: Record<string, unknown>) => emit("fatal", msg, { ...base, ...ctx }),
    error: (msg: string, ctx?: Record<string, unknown>) => emit("error", msg, { ...base, ...ctx }),
    warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, { ...base, ...ctx }),
    info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, { ...base, ...ctx }),
    debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, { ...base, ...ctx }),
  }),
};
