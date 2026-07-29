import { verifyOrigin } from "../lib/verify-origin.js";
import { rateLimit } from "../lib/rate-limit.js";
import {
  PLACE_ID_RE,
  SESSION_TOKEN_RE,
  parseAddressComponents,
  scrubKey,
} from "../lib/places.js";

const DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json";

// Only the fields the forms actually consume — Google bills Place Details by
// which field groups are requested, so asking for less costs less.
const FIELDS = "address_component,formatted_address,geometry/location";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  // Prevent abuse of the billable Google Places API from off-site callers.
  if (!verifyOrigin(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // One call per address the customer actually picks, so a much lower ceiling
  // than autocomplete still leaves plenty of room for someone changing their
  // mind a few times.
  const rl = await rateLimit(req, {
    name: "place-details",
    limit: 15,
    windowMs: 60 * 1000,
  });
  if (rl.limited) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({ error: "Too many requests" });
  }

  const { place_id: placeId, sessiontoken } = req.query;

  if (typeof placeId !== "string" || !PLACE_ID_RE.test(placeId)) {
    return res.status(400).json({ error: "Invalid place_id" });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error(
      "GOOGLE_MAPS_API_KEY is not defined in Vercel Environment Variables",
    );
    return res.status(500).json({ error: "Server configuration error" });
  }

  const url = new URL(DETAILS_URL);
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("fields", FIELDS);
  url.searchParams.set("language", "en-AU");

  // Closes the autocomplete session opened by the keystrokes that led here,
  // so Google bills the lookup once rather than per request.
  if (typeof sessiontoken === "string" && SESSION_TOKEN_RE.test(sessiontoken)) {
    url.searchParams.set("sessiontoken", sessiontoken);
  }

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    const data = await response.json();

    // The legacy API reports application errors as HTTP 200 with a `status`
    // field, so a non-2xx here means a transport/quota level problem.
    if (!response.ok) {
      throw new Error(`Google API HTTP ${response.status}`);
    }

    if (data.status !== "OK" || !data.result) {
      // REQUEST_DENIED here nearly always means the legacy "Places API" is not
      // enabled on the Google Cloud project (it is a separate product from
      // "Places API (New)"). Surface Google's own wording in the Vercel logs.
      throw new Error(
        `Google Place Details ${data.status}: ${data.error_message || "no message"}`,
      );
    }

    const parsed = parseAddressComponents(data.result.address_components);
    const location = data.result.geometry?.location || {};

    return res.status(200).json({
      status: "OK",
      result: {
        ...parsed,
        formatted_address: data.result.formatted_address || "",
        lat: typeof location.lat === "number" ? location.lat : null,
        lng: typeof location.lng === "number" ? location.lng : null,
      },
    });
  } catch (error) {
    console.error(
      "Google Place Details Proxy Error:",
      scrubKey(error && error.message ? error.message : error, apiKey),
    );
    return res.status(500).json({ error: "Failed to fetch place details" });
  }
}
