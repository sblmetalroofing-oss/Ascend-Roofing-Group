import { verifyOrigin } from "../lib/verify-origin.js";
import { rateLimit } from "../lib/rate-limit.js";

/**
 * Serves the live Google Business Profile rating and reviews.
 *
 * The site previously carried a blank rating slot and representative (not
 * attributed) testimonials, because publishing figures nobody had verified
 * would have been a claim we could not stand behind. Reading them from the
 * Business Profile at request time means the number on the page is whatever
 * Google actually holds, and it updates itself as reviews come in.
 *
 * Requires GOOGLE_PLACE_ID. Without it the endpoint reports
 * { available: false } and the page falls back to its existing content — it
 * never invents a rating.
 */

// Cached in module scope so warm invocations reuse the answer. Google bills
// per Place Details call and the rating moves slowly.
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
let cache = { at: 0, payload: null };

const unavailable = (reason) => ({ available: false, reason });

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  // Same protection as the other billable Google endpoint.
  if (!verifyOrigin(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const rl = await rateLimit(req, {
    name: "google-reviews",
    limit: 30,
    windowMs: 60 * 1000,
  });
  if (rl.limited) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json(unavailable("rate-limited"));
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    // Not an error condition: the site simply keeps its existing content.
    return res.status(200).json(unavailable("not-configured"));
  }

  if (cache.payload && Date.now() - cache.at < TTL_MS) {
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json(cache.payload);
  }

  try {
    // Places API (New) Place Details, matching places-autocomplete.js. The
    // field mask is required and keeps the call on the cheapest SKU that
    // still returns reviews.
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "rating,userRatingCount,googleMapsUri,reviews.rating,reviews.text,reviews.authorAttribution,reviews.relativePublishTimeDescription",
        },
        signal: AbortSignal.timeout(5000),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Place Details failed:",
        data?.error?.status,
        data?.error?.message,
      );
      return res.status(200).json(unavailable("lookup-failed"));
    }

    const reviews = (data.reviews || [])
      .filter((r) => r?.text?.text)
      .map((r) => ({
        rating: r.rating ?? null,
        text: r.text.text,
        author: r.authorAttribution?.displayName || "Google reviewer",
        photo: r.authorAttribution?.photoUri || null,
        when: r.relativePublishTimeDescription || "",
      }));

    const payload = {
      available: typeof data.rating === "number" && data.rating > 0,
      rating: typeof data.rating === "number" ? Number(data.rating.toFixed(1)) : null,
      total: data.userRatingCount ?? 0,
      profileUrl: data.googleMapsUri || null,
      reviews,
    };

    cache = { at: Date.now(), payload };
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json(payload);
  } catch (err) {
    // A timeout or network blip must never break the page.
    console.error("google-reviews error:", err?.message);
    return res.status(200).json(unavailable("request-failed"));
  }
}

// exported for tests
export const __testing = {
  resetCache: () => {
    cache = { at: 0, payload: null };
  },
};
