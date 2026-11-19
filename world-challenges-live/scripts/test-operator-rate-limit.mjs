import assert from "node:assert/strict";
import test from "node:test";
import {
  createOperatorApiWriteRateLimiter,
  createOperatorVerifyRateLimiter,
  OPERATOR_VERIFY_RATE_POLICY,
  OPERATOR_WRITE_RATE_POLICIES
} from "../server/operator-rate-limit.js";

const testPolicies = [
  { id: "global", limit: 3, windowMs: 1000 },
  { id: "questions", method: "POST", path: "/api/questions", limit: 2, windowMs: 1000 },
  { id: "generate", method: "POST", path: "/api/generate", limit: 1, windowMs: 1000 },
  { id: "other", limit: 5, windowMs: 1000 }
];

function invoke(limiter, { method = "POST", path = "/api/questions?fresh=1" } = {}) {
  const response = {
    statusCode: 200,
    headers: {},
    body: null,
    set(name, value) {
      if (name && typeof name === "object") Object.assign(this.headers, name);
      else this.headers[name] = value;
      return this;
    },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  let nextCalls = 0;
  limiter({ method, originalUrl: path }, response, () => { nextCalls += 1; });
  return { response, nextCalls };
}

test("assigns the documented conservative route budgets", () => {
  const byId = new Map(OPERATOR_WRITE_RATE_POLICIES.map((policy) => [policy.id, policy]));
  assert.deepEqual([byId.get("questions").limit, byId.get("questions").windowMs], [30, 60_000]);
  assert.deepEqual([byId.get("generate").limit, byId.get("generate").windowMs], [5, 60_000]);
  assert.deepEqual([byId.get("output-snapshot").limit, byId.get("output-snapshot").windowMs], [75, 60_000]);
  assert.deepEqual([byId.get("studio-director-state").limit, byId.get("studio-director-state").windowMs], [30, 60_000]);
  assert.deepEqual([byId.get("save-questions").limit, byId.get("save-questions").windowMs], [10, 60_000]);
  assert.deepEqual([byId.get("reset-cycle").limit, byId.get("reset-cycle").windowMs], [2, 900_000]);
  assert.deepEqual([byId.get("global").limit, byId.get("global").windowMs], [90, 60_000]);
  assert.deepEqual([OPERATOR_VERIFY_RATE_POLICY.limit, OPERATOR_VERIFY_RATE_POLICY.windowMs], [10, 60_000]);
});

test("limits repeated failed operator-key verification attempts without charging successful checks", () => {
  let now = 50_000;
  const limiter = createOperatorVerifyRateLimiter({
    now: () => now,
    policy: { limit: 2, windowMs: 1000 },
    getPeer: (req) => req.peer
  });
  const invokeVerify = (statusCode, peer = "peer-a") => {
    const response = {
      statusCode: 200,
      headers: {},
      body: null,
      set(values) { Object.assign(this.headers, values); return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }
    };
    let nextCalls = 0;
    limiter({ peer }, response, () => {
      nextCalls += 1;
      response.status(statusCode).json({ ok: statusCode === 200 });
    });
    return { response, nextCalls };
  };

  assert.equal(invokeVerify(401).nextCalls, 1);
  assert.equal(invokeVerify(200).nextCalls, 1, "a successful verification must not consume the failed-attempt quota");
  assert.equal(invokeVerify(401).nextCalls, 1);
  const blocked = invokeVerify(401);
  assert.equal(blocked.nextCalls, 0);
  assert.equal(blocked.response.statusCode, 429);
  assert.equal(blocked.response.body.error, "operator_verify_rate_limit_exceeded");
  assert.equal(blocked.response.headers["Retry-After"], "1");
  assert.equal(invokeVerify(401, "peer-b").nextCalls, 1, "one peer must not consume another peer's bucket");

  now += 1000;
  assert.equal(invokeVerify(401).nextCalls, 1, "expired failed-attempt buckets should reset");
});

test("rejects a request above the route budget with 429 and retry headers", () => {
  let now = 10_000;
  const limiter = createOperatorApiWriteRateLimiter({ now: () => now, policies: testPolicies });
  const accepted = invoke(limiter, { path: "/api/generate?fresh=1" });
  assert.equal(accepted.nextCalls, 1);
  assert.equal(accepted.response.headers["RateLimit-Limit"], "1");
  assert.equal(accepted.response.headers["RateLimit-Remaining"], "0");
  const denied = invoke(limiter, { path: "/api/generate" });
  assert.equal(denied.response.statusCode, 429);
  assert.equal(denied.response.body.error, "operator_rate_limit_exceeded");
  assert.equal(denied.response.headers["Retry-After"], "1");
  assert.equal(denied.response.headers["Cache-Control"], "no-store");
  assert.equal(denied.nextCalls, 0);

  now += 1000;
  assert.equal(invoke(limiter, { path: "/api/generate" }).nextCalls, 1, "a new window resets the budget");
});

test("applies a global write cap while leaving GET, HEAD, and OPTIONS unmetered", () => {
  const limiter = createOperatorApiWriteRateLimiter({ now: () => 20_000, policies: testPolicies });
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    for (let index = 0; index < 5; index += 1) {
      const result = invoke(limiter, { method, path: "/api/health" });
      assert.equal(result.nextCalls, 1, `${method} should not consume the write budget`);
      assert.equal(result.response.statusCode, 200);
    }
  }
  for (let index = 0; index < 3; index += 1) {
    assert.equal(invoke(limiter, { path: "/api/other-write" }).nextCalls, 1);
  }
  const denied = invoke(limiter, { path: "/api/other-write" });
  assert.equal(denied.response.statusCode, 429);
  assert.equal(denied.response.headers["RateLimit-Limit"], "3", "global write cap should be the limiting policy");
});

 test("charges the global bucket even when a route-specific request is denied", () => {
  let now = 30_000;
  const limiter = createOperatorApiWriteRateLimiter({ now: () => now, policies: testPolicies });
  assert.equal(invoke(limiter, { path: "/api/generate" }).nextCalls, 1);
  assert.equal(invoke(limiter, { path: "/api/generate" }).response.statusCode, 429);
  assert.equal(invoke(limiter, { path: "/api/questions" }).nextCalls, 1);
  assert.equal(invoke(limiter, { path: "/api/questions" }).response.statusCode, 429);
  now += 1000;
  assert.equal(invoke(limiter, { path: "/api/questions" }).nextCalls, 1);
});
