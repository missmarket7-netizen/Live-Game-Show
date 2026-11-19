import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createOperatorApiWriteGuard,
  createOperatorWriteGuard,
  OPERATOR_KEY_HEADER
} from "../server/operator-auth.js";

const validKey = "a".repeat(64);

function invoke(guard, { method = "POST", key, headerOverride } = {}) {
  const response = {
    statusCode: 200,
    headers: {},
    body: null,
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  let nextCalls = 0;
  const headers = {};
  if (headerOverride !== undefined) headers[OPERATOR_KEY_HEADER] = headerOverride;
  else if (key !== undefined) headers[OPERATOR_KEY_HEADER] = key;
  const request = {
    method,
    headers,
    get(name) { return headers[String(name).toLowerCase()]; }
  };
  guard(request, response, () => { nextCalls += 1; });
  return { response, nextCalls };
}

test("fails closed when the environment key is missing, too short, or contains whitespace", () => {
  for (const secret of [undefined, "short", "a".repeat(32) + " "]) {
    const result = invoke(createOperatorWriteGuard(() => secret), { key: validKey });
    assert.equal(result.response.statusCode, 503);
    assert.equal(result.response.body.error, "operator_key_unconfigured");
    assert.equal(result.response.headers["Cache-Control"], "no-store");
    assert.equal(result.nextCalls, 0);
  }
});

test("rejects missing, wrong, and oversized operator keys without continuing", () => {
  const guard = createOperatorWriteGuard(() => validKey);
  for (const input of [{}, { key: "b".repeat(64) }, { key: "x".repeat(4097) }]) {
    const result = invoke(guard, input);
    assert.equal(result.response.statusCode, 401);
    assert.equal(result.response.body.error, "operator_key_required");
    assert.equal(result.nextCalls, 0);
  }
});

test("accepts an exact operator key meeting the configured length and character rules", () => {
  const result = invoke(createOperatorWriteGuard(() => validKey), { key: validKey });
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.nextCalls, 1);
});

test("guards every mutating API method while leaving public GET routes untouched", () => {
  const guard = createOperatorApiWriteGuard(createOperatorWriteGuard(() => validKey));
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const denied = invoke(guard, { method });
    assert.equal(denied.response.statusCode, 401, method);
    assert.equal(denied.nextCalls, 0, method);
    const allowed = invoke(guard, { method, key: validKey });
    assert.equal(allowed.nextCalls, 1, method);
  }
  for (const method of ["GET", "HEAD", "OPTIONS"]) {
    const publicRead = invoke(guard, { method });
    assert.equal(publicRead.response.statusCode, 200, method);
    assert.equal(publicRead.nextCalls, 1, method);
  }
});

test("wires the guard to API routes while keeping the key entry in the operator page only", async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
  const [server, rateLimit, noRepeat, app, index, output] = await Promise.all([
    read("../server/server.js"),
    read("../server/operator-rate-limit.js"),
    read("../server/no-repeat-engine.js"),
    read("../public/app.js"),
    read("../public/index.html"),
    read("../public/output.html")
  ]);

  assert.match(server, /app\.use\("\/api", protectOperatorApiWrites, operatorApiWriteRateLimiter\)/);
  assert.match(server, /app\.get\("\/api\/operator\/verify", operatorVerifyRateLimiter, requireOperatorWrite/);
  assert.match(rateLimit, /operatorVerifyRateLimiter/);
  assert.match(server, /app\.post\("\/api\/generate"/);
  assert.match(server, /app\.post\("\/api\/save-questions"/);
  assert.match(noRepeat, /app\.post\("\/api\/questions"/);
  assert.match(noRepeat, /app\.post\("\/api\/reset-cycle"/);
  assert.match(app, /operatorApiFetch\('\/api\/questions/);
  assert.match(app, /operatorApiFetch\('\/api\/generate/);
  assert.match(app, /sessionStorage\.setItem\(OPERATOR_KEY_STORAGE_KEY/);
  assert.doesNotMatch(app, /localStorage\.(?:getItem|setItem)\(OPERATOR_KEY_STORAGE_KEY/);
  assert.match(index, /id="operatorKeyInput"[^>]*type="password"/);
  assert.match(index, /data-operator-key-toggle/);
  assert.doesNotMatch(output, /operatorKey|OPERATOR_WRITE_KEY|X-Operator-Key/);
});
