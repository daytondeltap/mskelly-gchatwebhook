const crypto = require("node:crypto");

const MAX_BYTES = 8192;
const MAX_CHARS = 2000;
const RATE_SCRIPT = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n";

function respond(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.status(status).json(body);
}

function isValidWebhook(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "chat.googleapis.com" &&
      /^\/v1\/spaces\/[^/]+\/messages$/.test(url.pathname) &&
      Boolean(url.searchParams.get("key")) &&
      Boolean(url.searchParams.get("token")) &&
      !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

function equalsSecret(candidate, expected) {
  const a = crypto.createHash("sha256").update(candidate).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

async function quota(key, periodMs, limit) {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const response = await fetch(base, {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(["EVAL", RATE_SCRIPT, "1", key, String(periodMs)]),
    signal: AbortSignal.timeout(4000)
  });
  if (!response.ok) throw new Error("Rate limiter unavailable");
  const data = await response.json();
  if (!Number.isInteger(Number(data.result))) throw new Error("Rate limiter unavailable");
  return Number(data.result) <= limit;
}

module.exports = async function handler(req, res) {
  res.setHeader("Allow", "POST");
  res.setHeader("Referrer-Policy", "no-referrer");
  if (req.method !== "POST") return respond(res, 405, { error: "Use POST to send a message." });

  const required = ["GOOGLE_CHAT_WEBHOOK_URL", "SEND_PASSWORD", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
  if (required.some(key => !process.env[key]) || process.env.SEND_PASSWORD.length < 12 ||
      !isValidWebhook(process.env.GOOGLE_CHAT_WEBHOOK_URL)) {
    return respond(res, 503, { error: "Service is not configured. Contact the administrator." });
  }

  const origin = req.headers.origin;
  const publicOrigin = process.env.PUBLIC_ORIGIN || ("https://" + req.headers.host);
  if (!origin || origin !== publicOrigin) return respond(res, 403, { error: "This request must come from the website." });
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || "")) {
    return respond(res, 415, { error: "Unsupported request format." });
  }
  if (Number(req.headers["content-length"] || 0) > MAX_BYTES) {
    return respond(res, 413, { error: "Request is too large." });
  }

  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.password !== "string" || typeof body.message !== "string" ||
      JSON.stringify(body).length > MAX_BYTES) {
    return respond(res, 400, { error: "Enter a valid password and message." });
  }
  const message = body.message.trim();
  if (!message || message.length > MAX_CHARS || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(message)) {
    return respond(res, 400, { error: "Message must be 1–2000 characters of plain text." });
  }
  if (body.password.length > 1024) return respond(res, 400, { error: "Invalid password." });

  // Only the edge proxy's first client address is used for abuse control. Hash it before storing.
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  const identity = crypto.createHmac("sha256", process.env.SEND_PASSWORD).update(ip).digest("hex");
  try {
    // Fail closed: the app does not relay anything while Redis is down.
    if (!(await quota("gchat:attempt:" + identity, 15 * 60 * 1000, 15))) {
      return respond(res, 429, { error: "Too many attempts. Try again in 15 minutes." });
    }
  } catch {
    return respond(res, 503, { error: "Sending is temporarily unavailable. Try later." });
  }

  if (!equalsSecret(body.password, process.env.SEND_PASSWORD)) {
    return respond(res, 401, { error: "Incorrect access password." });
  }

  try {
    // The shared Google Chat space can have a 1-message-per-second quota.
    if (!(await quota("gchat:space:" + crypto.createHash("sha256").update(process.env.GOOGLE_CHAT_WEBHOOK_URL).digest("hex"), 1000, 1))) {
      return respond(res, 429, { error: "A message was just sent. Wait a moment and retry." });
    }
    if (!(await quota("gchat:send:" + identity, 60 * 1000, 10))) {
      return respond(res, 429, { error: "Sending too quickly. Try again in a minute." });
    }
  } catch {
    return respond(res, 503, { error: "Sending is temporarily unavailable. Try later." });
  }

  try {
    const sent = await fetch(process.env.GOOGLE_CHAT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ text: message }),
      redirect: "error",
      signal: AbortSignal.timeout(8000)
    });
    if (!sent.ok) return respond(res, 502, { error: "Google Chat could not accept the message. Please try again later." });
    return respond(res, 200, { ok: true });
  } catch {
    return respond(res, 502, { error: "Could not reach Google Chat. The message may have been delivered; check the space before retrying." });
  }
};