import { timingSafeEqual } from "node:crypto";

export const OPERATOR_KEY_ENV = "OPERATOR_WRITE_KEY";
export const OPERATOR_KEY_HEADER = "x-operator-key";
const MIN_KEY_BYTES = 32;
const MAX_PROVIDED_KEY_LENGTH = 4096;
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isOperatorKeyConfigured(value = process.env[OPERATOR_KEY_ENV]) {
  return typeof value === "string"
    && Buffer.byteLength(value, "utf8") >= MIN_KEY_BYTES
    && !/\s/.test(value);
}

function reject(res, status, error, message) {
  res.set("Cache-Control", "no-store");
  return res.status(status).json({ error, message });
}

export function createOperatorWriteGuard(getSecret = () => process.env[OPERATOR_KEY_ENV]) {
  return function requireOperatorWrite(req, res, next) {
    let expected;
    try {
      expected = getSecret();
    } catch (error) {
      expected = "";
    }

    if (!isOperatorKeyConfigured(expected)) {
      return reject(
        res,
        503,
        "operator_key_unconfigured",
        "مفتاح المشغّل غير مضبوط أو لا يحقق الحد الأدنى المطلوب في بيئة الخادم."
      );
    }

    const provided = typeof req.get === "function"
      ? req.get(OPERATOR_KEY_HEADER)
      : req.headers && req.headers[OPERATOR_KEY_HEADER];

    if (typeof provided !== "string" || provided.length > MAX_PROVIDED_KEY_LENGTH) {
      return reject(res, 401, "operator_key_required", "مفتاح المشغّل مطلوب لهذه العملية.");
    }

    const expectedBytes = Buffer.from(expected, "utf8");
    const providedBytes = Buffer.from(provided, "utf8");
    if (expectedBytes.length !== providedBytes.length || !timingSafeEqual(expectedBytes, providedBytes)) {
      return reject(res, 401, "operator_key_required", "مفتاح المشغّل غير صحيح.");
    }

    return next();
  };
}

export const requireOperatorWrite = createOperatorWriteGuard();

export function createOperatorApiWriteGuard(authenticate = requireOperatorWrite) {
  return function protectOperatorApiWrites(req, res, next) {
    const method = String(req.method || "GET").toUpperCase();
    if (!WRITE_METHODS.has(method)) return next();
    return authenticate(req, res, next);
  };
}

export const protectOperatorApiWrites = createOperatorApiWriteGuard();
