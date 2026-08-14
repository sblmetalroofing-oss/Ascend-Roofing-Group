import { verifyOrigin } from "../lib/verify-origin.js";
import { rateLimit } from "../lib/rate-limit.js";

const MIN_INPUT_LENGTH = 3;
const MAX_INPUT_LENGTH = 200;

// Typing one address fires a request per debounced keystroke, and Australian
// mobile carriers put whole suburbs behind a handful of CGNAT addresses, so
// the old 20/min ceiling silently 429'd real customers part-way through their
// street name. The prefix cache below absorbs most of the extra volume before
// it ever reaches the billable Google endpoint.
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 1000;

// Prefix -> predictions, per warm instance. Every typed address walks through
// the same prefixes, and address suggestions barely change minute to minute,
// so a short TTL removes most repeat calls to Google (including the ones a
// customer retyping their address would otherwise pay for twice).
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const _cache = new Map(); // insertion-ordered → oldest key is the first key

function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.storedAt >= CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  _cache.delete(key); // re-insert to move it to the newest position
  _cache.set(key, hit);
  return hit.predictions;
}

function cacheSet(key, predictions) {
  _cache.delete(key);
  _cache.set(key, { predictions, storedAt: Date.now() });
  while (_cache.size > CACHE_MAX_ENTRIES) {
    _cache.delete(_cache.keys().next().value);
  }
}

// A repeated query string (?input=a&input=b) arrives as an array. Reading it
// straight into .trim() threw a TypeError outside the try block, which Vercel
// turned into an opaque 500.
function firstValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  // Prevent abuse of the billable Google Places API from off-site callers.
  // Same-origin GETs carry no Origin header, so this check rests on Referer —
  // allowSameSiteFetch keeps the dropdown alive for the customers whose
  // browser or privacy extension strips it.
  if (!verifyOrigin(req, { allowSameSiteFetch: true })) {
    return res.status(403).json({ predictions: [], error: "Forbidden" });
  }

  const rawInput = firstValue(req.query?.input);
  const trimmed = typeof rawInput === "string" ? rawInput.trim() : "";

  if (trimmed.length < MIN_INPUT_LENGTH) {
    return res.status(400).json({ predictions: [] });
  }

  const input = trimmed.slice(0, MAX_INPUT_LENGTH);
  const cacheKey = input.toLowerCase();

  // Served before the rate limit on purpose: a cache hit costs nothing, and
  // the limiter exists to cap Google spend, not to ration free responses.
  const cached = cacheGet(cacheKey);
  if (cached) {
    return res.status(200).json({ status: "OK", predictions: cached, cached: true });
  }

  const rl = await rateLimit(req, {
    name: "places-autocomplete",
    limit: RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
  });
  if (rl.limited) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res
      .status(429)
      .json({ predictions: [], error: "Too many requests", reason: "RATE_LIMITED" });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error(
      "GOOGLE_MAPS_API_KEY is not defined in Vercel Environment Variables",
    );
    return res
      .status(500)
      .json({ predictions: [], error: "Server configuration error", reason: "NOT_CONFIGURED" });
  }

  try {
    // Places API (New). The legacy /maps/api/place/autocomplete endpoint
    // answers REQUEST_DENIED on Google Cloud projects that can't enable the
    // retired legacy Places API, which silently killed the address dropdown.
    // Region restricted to Australia to keep results relevant for QLD.
    const response = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        body: JSON.stringify({
          input,
          includedRegionCodes: ["au"],
        }),
        signal: AbortSignal.timeout(5000),
      },
    );

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      // Surface Google's real reason (e.g. "Places API (New) has not been
      // used in project ... before or it is disabled") in Vercel logs, and
      // hand the short status code back so the failure is visible in the
      // browser's network tab instead of just an empty dropdown.
      const reason = data?.error?.status || `HTTP_${response.status}`;
      console.error(
        `Google Places autocomplete failed: HTTP ${response.status}: ${reason} — ${data?.error?.message || "no message"}`,
      );
      return res
        .status(502)
        .json({ predictions: [], error: "Failed to fetch predictions", reason });
    }

    // Map to the legacy response shape the frontend dropdown consumes.
    const predictions = (data?.suggestions || [])
      .map((s) => s.placePrediction)
      .filter(Boolean)
      .map((p) => ({ description: p.text?.text || "", place_id: p.placeId }))
      .filter((p) => p.description);

    cacheSet(cacheKey, predictions);

    return res.status(200).json({ status: "OK", predictions });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    console.error("Google Places Proxy Error:", error);
    return res.status(502).json({
      predictions: [],
      error: "Failed to fetch predictions",
      reason: timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNREACHABLE",
    });
  }
}

export function _resetCacheForTests() {
  _cache.clear();
}
