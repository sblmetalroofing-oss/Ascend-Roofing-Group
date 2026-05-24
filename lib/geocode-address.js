// Shared address geocoding + display helpers used by the inquiry-form
// handlers (api/roof-quote.js, api/submit-quote.js) so lead emails always
// carry the suburb/postcode, even when the customer typed the address by hand
// instead of picking a Google autocomplete suggestion.

const SEQ_POSTCODE_MIN = 4000;
const SEQ_POSTCODE_MAX = 4600;

export function isSEQPostcode(postcode) {
  const pc = parseInt(postcode, 10);
  return !isNaN(pc) && pc >= SEQ_POSTCODE_MIN && pc <= SEQ_POSTCODE_MAX;
}

// Append suburb / postcode to the address only when they aren't already part
// of the string, so addresses chosen from autocomplete (already complete) are
// left untouched and we never duplicate the suburb.
export function buildDisplayAddress(address, { suburb = "", postcode = "" } = {}) {
  let out = (address || "").trim();
  if (suburb && !out.toLowerCase().includes(suburb.toLowerCase())) {
    out += `, ${suburb}`;
  }
  if (postcode && !out.includes(String(postcode))) {
    out += ` QLD ${postcode}`;
  }
  return out;
}

// Geocode an address via Nominatim / OpenStreetMap, restricted to South East
// Queensland. Returns { lat, lng, postcode, formatted_address, suburb } on
// success, or { error } when the address can't be resolved or is out of area.
export async function geocodeAddress(address) {
  let query = address;
  if (!/qld|queensland/i.test(address)) {
    query = `${address}, QLD, Australia`;
  } else if (!/australia/i.test(address)) {
    query = `${address}, Australia`;
  }

  const params = new URLSearchParams({
    q: query,
    format: "json",
    addressdetails: "1",
    limit: "1",
    countrycodes: "au",
    viewbox: "152.0,-26.5,154.0,-28.5",
  });

  try {
    const geocodeSignal = AbortSignal.timeout(8000);
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: {
          "User-Agent":
            "AscendRoofingQuoteGenerator/1.0 (admin@ascendroofinggroup.com.au)",
          Accept: "application/json",
        },
        signal: geocodeSignal,
      },
    );

    if (!resp.ok) {
      return {
        error: "Geocoding service temporarily unavailable. Please try again.",
      };
    }

    const results = await resp.json();
    if (!results || results.length === 0) {
      return { error: `Could not find address: ${address}` };
    }

    const result = results[0];
    const addr = result.address || {};
    const state = addr.state || "";
    const postcode = addr.postcode || "";

    // Verify Queensland
    if (!/queensland|qld/i.test(state)) {
      return {
        error:
          "Address appears to be outside Queensland. We currently service South East Queensland only (Brisbane, Gold Coast, Logan, Ipswich, Moreton Bay).",
      };
    }

    // Verify SEQ postcode
    if (postcode && !isSEQPostcode(postcode)) {
      return {
        error: `Postcode ${postcode} is outside our primary service area. We service Brisbane, Gold Coast, Logan, Ipswich, and Moreton Bay regions.`,
      };
    }

    return {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      postcode,
      formatted_address: result.display_name,
      suburb: addr.suburb || addr.town || addr.city || "",
    };
  } catch (err) {
    console.error("Geocoding error:", err);
    return {
      error: "Geocoding service temporarily unavailable. Please try again.",
    };
  }
}
