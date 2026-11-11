// Read-only connectivity check. Does not expose database URLs, tokens or webhook secrets.
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ status: "method_not_allowed" });
  }

  const required = ["GOOGLE_CHAT_WEBHOOK_URL", "SEND_PASSWORD", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "PUBLIC_ORIGIN"];
  if (required.some(key => !process.env[key])) {
    return res.status(503).json({ status: "not_configured" });
  }

  try {
    const redisUrl = new URL(process.env.UPSTASH_REDIS_REST_URL);
    if (redisUrl.protocol !== "https:" || !redisUrl.hostname.endsWith(".upstash.io")) {
      return res.status(503).json({ status: "invalid_redis_configuration" });
    }
    const response = await fetch(redisUrl.origin, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.UPSTASH_REDIS_REST_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(["PING"]),
      cache: "no-store",
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return res.status(503).json({ status: "redis_unavailable" });
    const result = await response.json();
    if (result.result !== "PONG") return res.status(503).json({ status: "redis_unavailable" });
    return res.status(200).json({ status: "ready", redis: "connected", chat: "configured_not_tested" });
  } catch {
    return res.status(503).json({ status: "redis_unavailable" });
  }
};
