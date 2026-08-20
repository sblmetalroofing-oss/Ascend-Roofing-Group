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
 * Configuration, in order of preference:
 *   GOOGLE_PLACE_ID    the place id — one call, no ambiguity
 *   GOOGLE_PLACE_QUERY a text query to resolve the place id from, if the id
 *                      is unknown (a profile URL gives a CID, which the
 *                      Places API cannot accept)
 *   GOOGLE_PLACE_CID   the CID from the profile URL, used only to build the
 *                      "read reviews" link when Google does not return one
 *
 * If the place cannot be identified, or Google errors, the endpoint reports
 * { available: false } and the page falls back to its existing content — it
 * never invents a rating.
 */

// Cached in module scope so warm invocations reuse the answer. Google bills
// per Place Details call and the rating moves slowly.
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
let cache = { at: 0, payload: null };

const unavailable = (reason) => ({ available: false, reason });

// Resolved once per warm instance; the place id for a business does not move.
let resolvedPlaceId = null;

/**
 * Finds the Business Profile's place id by name and locality.
 *
 * GOOGLE_PLACE_ID short-circuits this and is preferred — one fewer billable
 * call, and no chance of matching the wrong listing. This exists because the
 * identifier most owners can find is the CID in their profile URL, which the
 * Places API cannot accept.
 */
async function resolvePlaceId(apiKey) {
  const query =
    process.env.GOOGLE_PLACE_QUERY || "Ascend Roofing Group, Brisbane QLD, Australia";
  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName",
      },
      body: JSON.stringify({ textQuery: query, regionCode: "AU", maxResultCount: 1 }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error("Place text search failed:", data?.error?.status, data?.error?.message);
      return null;
    }
    const id = data?.places?.[0]?.id || null;
    if (id) {
      // Logged so the id can be pinned in GOOGLE_PLACE_ID and this call skipped.
      console.log(
        `Resolved place id ${id} for "${data.places[0].displayName?.text || query}". ` +
          "Set GOOGLE_PLACE_ID to skip this lookup.",
      );
      resolvedPlaceId = id;
    }
    return id;
  } catch (err) {
    console.error("Place text search error:", err?.message);
    return null;
  }
}

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

  if (!apiKey) {
    // Not an error condition for the visitor — the site simply keeps its
    // existing content — but it is always a misconfiguration, and returning
    // 200 in silence made a missing variable look identical to a working
    // one in the logs. Say so.
    console.warn(
      "GOOGLE_MAPS_API_KEY is not set for this environment, so the Google " +
        "rating cannot be read. Check the variable name and that Production " +
        "is ticked in the Vercel project settings.",
    );
    return res.status(200).json(unavailable("not-configured"));
  }

  if (cache.payload && Date.now() - cache.at < TTL_MS) {
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
    return res.status(200).json(cache.payload);
  }

  let placeId = process.env.GOOGLE_PLACE_ID;

  try {
    // A Business Profile URL carries a CID, not a place id, and Google
    // publishes no CID-to-place-id conversion. So when only the business
    // name is configured, resolve the place id once by text search and
    // reuse it for the life of the instance.
    if (!placeId) {
      placeId = resolvedPlaceId || (await resolvePlaceId(apiKey));
      if (!placeId) {
        return res.status(200).json(unavailable("place-not-found"));
      }
    }

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
      profileUrl:
        data.googleMapsUri ||
        (process.env.GOOGLE_PLACE_CID
          ? `https://maps.google.com/?cid=${encodeURIComponent(process.env.GOOGLE_PLACE_CID)}`
          : null),
      reviews,
    };

    // One line per cold fetch, so the logs show whether the profile is
    // actually being read without having to reproduce a browser request
    // (the origin guard makes this endpoint awkward to curl).
    console.log(
      `Google profile: rating=${payload.rating} of ${payload.total} ratings, ` +
        `${payload.reviews.length} review(s) with text, available=${payload.available}`,
    );

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
    resolvedPlaceId = null;
  },
};
