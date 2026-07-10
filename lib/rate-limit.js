// Per-IP rate limiting for the public API endpoints.
//
// Durable mode: when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are
// set (Vercel Marketplace → Upstash Redis, free tier), limits are enforced
// across all serverless instances via a fixed window (INCR + EXPIRE NX on a
// window-suffixed key).
//
// Fallback mode: without those env vars, an in-memory Map limits per warm
// instance only (best effort — cold starts reset it). The site keeps working
// either way; Upstash errors fail open so an outage never blocks real leads.

const _memory = new Map(); // key -> { count, windowStart }
const MEMORY_MAX_ENTRIES = 5000;

export function getClientIp(req) {
  // First x-forwarded-for segment. On Vercel this is platform-set but the
  // leftmost value is client-influenced; accepted residual risk — spoofing
  // rotates the limiter key but each spoofed value is still limited.
  return (
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function memoryLimit(key, limit, windowMs) {
  const now = Date.now();
  if (_memory.size > MEMORY_MAX_ENTRIES) {
    for (const [k, v] of _memory) {
      if (now - v.windowStart >= windowMs) _memory.delete(k);
    }
    if (_memory.size > MEMORY_MAX_ENTRIES) _memory.clear();
  }
  const entry = _memory.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    _memory.set(key, { count: 1, windowStart: now });
    return { limited: false };
  }
  entry.count++;
  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000);
    return { limited: true, retryAfter: Math.max(retryAfter, 1) };
  }
  return { limited: false };
}

async function upstashLimit(key, limit, windowMs) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  const ttlSec = Math.ceil(windowMs / 1000);
  const windowKey = `${key}:${Math.floor(Date.now() / windowMs)}`;
  const resp = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", windowKey],
      ["EXPIRE", windowKey, String(ttlSec), "NX"],
    ]),
    signal: AbortSignal.timeout(2000),
  });
  if (!resp.ok) throw new Error(`Upstash HTTP ${resp.status}`);
  const results = await resp.json();
  const count = Number(results?.[0]?.result);
  if (!Number.isFinite(count)) throw new Error("Upstash: unexpected response");
  if (count > limit) {
    const windowEnd = (Math.floor(Date.now() / windowMs) + 1) * windowMs;
    return {
      limited: true,
      retryAfter: Math.max(Math.ceil((windowEnd - Date.now()) / 1000), 1),
    };
  }
  return { limited: false };
}

/**
 * @param {object} req - the incoming request (for the client IP)
 * @param {object} opts
 * @param {string} opts.name - limiter bucket, e.g. "roof-quote"
 * @param {number} opts.limit - max requests per window
 * @param {number} opts.windowMs - window length in ms
 * @returns {Promise<{limited: boolean, retryAfter?: number}>}
 */
export async function rateLimit(req, { name, limit, windowMs }) {
  const key = `rl:${name}:${getClientIp(req)}`;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      return await upstashLimit(key, limit, windowMs);
    } catch (err) {
      // Fail open: a limiter outage must never block real customers.
      console.error("rate-limit: Upstash unavailable, allowing request:", err.message);
      return { limited: false };
    }
  }
  return memoryLimit(key, limit, windowMs);
}

export function _resetForTests() {
  _memory.clear();
}
