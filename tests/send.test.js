const test = require("node:test");
const assert = require("node:assert/strict");
const handler = require("../api/send.js");

const webhook = "https://chat.googleapis.com/v1/spaces/SPACE/messages?key=key&token=token";
function request(overrides = {}) {
  return {
    method: "POST",
    headers: { origin: "https://example.vercel.app", host: "example.vercel.app", "content-type": "application/json", ...overrides.headers },
    body: { password: "a-long-test-password!", message: "Hello from test", ...overrides.body },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== "headers" && key !== "body"))
  };
}
function response() {
  return {
    code: 0, payload: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; return this; },
    status(code) { this.code = code; return this; },
    json(body) { this.payload = body; return this; }
  };
}
const originalFetch = global.fetch;
const originalEnv = { ...process.env };
function configure() {
  process.env.GOOGLE_CHAT_WEBHOOK_URL = webhook;
  process.env.SEND_PASSWORD = "a-long-test-password!";
  process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "private-token";
  process.env.PUBLIC_ORIGIN = "https://example.vercel.app";
}
function mockRedisAndChat({ redisUnavailable = false, chatStatus = 200 } = {}) {
  const sends = [];
  global.fetch = async (url, options) => {
    if (String(url).includes("upstash.io")) {
      if (redisUnavailable) return { ok: false, status: 503 };
      assert.equal(options.headers.Authorization, "Bearer private-token");
      return { ok: true, json: async () => ({ result: 1 }) };
    }
    sends.push({ url, options });
    return { ok: chatStatus >= 200 && chatStatus < 300, status: chatStatus };
  };
  return sends;
}
test.after(() => { global.fetch = originalFetch; process.env = originalEnv; });

test("rejects other methods", async () => {
  configure(); const res = response();
  await handler(request({ method: "GET" }), res);
  assert.equal(res.code, 405);
});
test("fails safely without secrets", async () => {
  configure(); delete process.env.GOOGLE_CHAT_WEBHOOK_URL;
  const res = response(); await handler(request(), res);
  assert.equal(res.code, 503);
});
test("rejects cross-origin requests", async () => {
  configure(); const res = response();
  await handler(request({ headers: { origin: "https://attacker.example" } }), res);
  assert.equal(res.code, 403);
});
test("rejects empty messages", async () => {
  configure(); const res = response();
  await handler(request({ body: { message: "   " } }), res);
  assert.equal(res.code, 400);
});
test("rejects wrong password without contacting Chat", async () => {
  configure(); const sends = mockRedisAndChat();
  const res = response(); await handler(request({ body: { password: "wrong-password" } }), res);
  assert.equal(res.code, 401); assert.equal(sends.length, 0);
});
test("relays only plain text to Google Chat", async () => {
  configure(); const sends = mockRedisAndChat();
  const res = response(); await handler(request(), res);
  assert.equal(res.code, 200); assert.deepEqual(res.payload, { ok: true });
  assert.equal(sends.length, 1);
  assert.deepEqual(JSON.parse(sends[0].options.body), { text: "Hello from test" });
});
test("fails closed if rate limiter is down", async () => {
  configure(); const sends = mockRedisAndChat({ redisUnavailable: true });
  const res = response(); await handler(request(), res);
  assert.equal(res.code, 503); assert.equal(sends.length, 0);
});
test("does not expose upstream errors", async () => {
  configure(); mockRedisAndChat({ chatStatus: 403 });
  const res = response(); await handler(request(), res);
  assert.equal(res.code, 502);
  assert.ok(!JSON.stringify(res.payload).includes("token="));
});
