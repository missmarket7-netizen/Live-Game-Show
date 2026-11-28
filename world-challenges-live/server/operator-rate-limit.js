const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const OPERATOR_WRITE_RATE_POLICIES = Object.freeze([
  Object.freeze({ id: "global", limit: 90, windowMs: 60_000 }),
  Object.freeze({ id: "questions", method: "POST", path: "/api/questions", limit: 30, windowMs: 60_000 }),
  Object.freeze({ id: "generate", method: "POST", path: "/api/generate", limit: 5, windowMs: 60_000 }),
  Object.freeze({ id: "output-snapshot", method: "POST", path: "/api/output-snapshot", limit: 75, windowMs: 60_000 }),
  Object.freeze({ id: "studio-director-state", method: "POST", path: "/api/studio-director-state", limit: 30, windowMs: 60_000 }),
  Object.freeze({ id: "studio-v2-state", method: "POST", path: "/api/studio-v2-state", limit: 30, windowMs: 60_000 }),
  Object.freeze({ id: "save-questions", method: "POST", path: "/api/save-questions", limit: 10, windowMs: 60_000 }),
  Object.freeze({ id: "reset-cycle", method: "POST", path: "/api/reset-cycle", limit: 2, windowMs: 15 * 60_000 }),
  Object.freeze({ id: "other", limit: 30, windowMs: 60_000 })
]);

export const OPERATOR_VERIFY_RATE_POLICY = Object.freeze({ limit: 10, windowMs: 60_000 });

function normalizedPath(req) {
  return String(req.originalUrl || req.url || "/")
    .split("?", 1)[0]
    .replace(/\/+$/, "") || "/";
}

function applyRateHeaders(res, policy, bucket, now, blocked) {
  const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  res.set({
    "Cache-Control": "no-store",
    "RateLimit-Limit": String(policy.limit),
    "RateLimit-Remaining": String(Math.max(0, policy.limit - bucket.count)),
    "RateLimit-Reset": String(resetSeconds),
    "RateLimit-Policy": `${policy.limit};w=${Math.ceil(policy.windowMs / 1000)}`
  });
  if (blocked) res.set("Retry-After", String(resetSeconds));
}

/**
 * Per-process, per-operator limits. The application currently has one shared operator key,
 * so buckets deliberately do not depend on IP/X-Forwarded-For (which is proxy-dependent).
 * Mount after protectOperatorApiWrites; no credential is copied into this middleware or logs.
 */
export function createOperatorApiWriteRateLimiter({
  now = Date.now,
  policies = OPERATOR_WRITE_RATE_POLICIES
} = {}) {
  const buckets = new Map();
  const globalPolicy = policies.find((policy) => policy.id === "global");
  const fallbackPolicy = policies.find((policy) => policy.id === "other");

  return function operatorApiWriteRateLimiter(req, res, next) {
    const method = String(req.method || "GET").toUpperCase();
    if (!WRITE_METHODS.has(method)) return next();

    const requestPath = normalizedPath(req);
    const routePolicy = policies.find((policy) =>
      policy.id !== "global" && policy.id !== "other"
      && policy.method === method && policy.path === requestPath
    );
    const applicablePolicies = [globalPolicy, routePolicy || fallbackPolicy].filter(Boolean);
    if (!applicablePolicies.length) return next();

    const currentTime = Number(now());
    const timestamp = Number.isFinite(currentTime) ? currentTime : Date.now();

    for (const policy of applicablePolicies) {
      let bucket = buckets.get(policy.id);
      if (!bucket || timestamp < bucket.startedAt || timestamp >= bucket.resetAt) {
        bucket = { count: 0, startedAt: timestamp, resetAt: timestamp + policy.windowMs };
        buckets.set(policy.id, bucket);
      }

      if (bucket.count >= policy.limit) {
        applyRateHeaders(res, policy, bucket, timestamp, true);
        return res.status(429).json({
          error: "operator_rate_limit_exceeded",
          message: "تم تجاوز الحد المؤقت لطلبات المشغّل. انتظر ثم أعد المحاولة."
        });
      }

      bucket.count += 1;
    }

    const headerPolicy = routePolicy || globalPolicy || fallbackPolicy;
    if (headerPolicy) applyRateHeaders(res, headerPolicy, buckets.get(headerPolicy.id), timestamp, false);
    return next();
  };
}

/**
 * Limits failed credential checks without storing credentials. It keys only on
 * the network peer address and is mounted only on the operator verification route.
 */
export function createOperatorVerifyRateLimiter({
  now = Date.now,
  policy = OPERATOR_VERIFY_RATE_POLICY,
  getPeer = (req) => req.socket && req.socket.remoteAddress || "unknown"
} = {}) {
  const failures = new Map();

  return function operatorVerifyRateLimiter(req, res, next) {
    const peer = String(getPeer(req) || "unknown").slice(0, 128);
    const currentTime = Number(now());
    const timestamp = Number.isFinite(currentTime) ? currentTime : Date.now();
    let bucket = failures.get(peer);
    if (!bucket || timestamp < bucket.startedAt || timestamp >= bucket.resetAt) {
      bucket = { count: 0, startedAt: timestamp, resetAt: timestamp + policy.windowMs };
      failures.set(peer, bucket);
      if (failures.size > 10_000) {
        for (const [knownPeer, knownBucket] of failures) {
          if (knownBucket.resetAt <= timestamp) failures.delete(knownPeer);
          if (failures.size <= 10_000) break;
        }
        while (failures.size > 10_000) failures.delete(failures.keys().next().value);
      }
    }

    if (bucket.count >= policy.limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000));
      res.set({
        "Cache-Control": "no-store",
        "RateLimit-Limit": String(policy.limit),
        "RateLimit-Remaining": "0",
        "RateLimit-Reset": String(retryAfter),
        "RateLimit-Policy": `${policy.limit};w=${Math.ceil(policy.windowMs / 1000)}`,
        "Retry-After": String(retryAfter)
      });
      return res.status(429).json({
        error: "operator_verify_rate_limit_exceeded",
        message: "تم تجاوز محاولات التحقق المؤقتة. انتظر ثم أعد المحاولة."
      });
    }

    const originalStatus = res.status;
    let responseStatus = Number(res.statusCode) || 200;
    res.status = function trackVerificationStatus(code) {
      responseStatus = Number(code) || responseStatus;
      return originalStatus.call(this, code);
    };
    const originalJson = res.json;
    res.json = function trackVerificationResponse(body) {
      if (responseStatus === 401) bucket.count += 1;
      return originalJson.call(this, body);
    };
    return next();
  };
}

export const operatorApiWriteRateLimiter = createOperatorApiWriteRateLimiter();
export const operatorVerifyRateLimiter = createOperatorVerifyRateLimiter();
