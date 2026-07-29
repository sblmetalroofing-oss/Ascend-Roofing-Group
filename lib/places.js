// Shared helpers for the legacy Google Places API (Autocomplete + Details).
//
// The site uses the legacy /maps/api/place/* endpoints rather than Places API
// (New) because the legacy Details response exposes `address_components`,
// which is what lets a picked suggestion fan out into separate street /
// suburb / state / postcode form fields.
//
// If autocomplete starts answering REQUEST_DENIED, the legacy "Places API"
// is not enabled on the Google Cloud project — that is the first thing to
// check, and the proxy logs Google's own wording to make it obvious.

// Google place IDs are URL-safe base64-ish strings. Validated before going
// into the upstream URL so a caller can't smuggle in extra query parameters.
export const PLACE_ID_RE = /^[A-Za-z0-9_-]{5,512}$/;

// Session tokens are client-generated UUIDs. Autocomplete keystrokes that
// share a token with the Details call closing the session are billed as one
// session rather than per request.
export const SESSION_TOKEN_RE = /^[A-Za-z0-9-]{8,64}$/;

// Google puts the key in the query string for the legacy endpoints, so scrub
// it out of anything we log — fetch failures sometimes echo the request URL.
export function scrubKey(value, apiKey) {
  const text = String(value);
  return apiKey ? text.split(apiKey).join("***") : text;
}

function componentOfType(components, type) {
  return components.find((c) => (c.types || []).includes(type)) || null;
}

function longName(components, type) {
  const c = componentOfType(components, type);
  return c ? c.long_name || "" : "";
}

function shortName(components, type) {
  const c = componentOfType(components, type);
  return c ? c.short_name || c.long_name || "" : "";
}

// Flatten Google's address_components array into the flat fields the forms
// use. Australian addresses normally carry the suburb in `locality`, but
// rural and gazetted localities sometimes only populate the sublocality or
// council-area fields, so fall through in order of specificity instead of
// trusting `locality` alone.
export function parseAddressComponents(components) {
  const list = Array.isArray(components) ? components : [];

  const streetNumber = longName(list, "street_number");
  const route = longName(list, "route");
  const unit = longName(list, "subpremise");

  let street = [streetNumber, route].filter(Boolean).join(" ");
  // Australian convention for a unit/apartment: "2/14 Smith Street".
  if (unit) street = street ? `${unit}/${street}` : unit;

  const suburb =
    longName(list, "locality") ||
    longName(list, "sublocality") ||
    longName(list, "sublocality_level_1") ||
    longName(list, "postal_town") ||
    longName(list, "administrative_area_level_2");

  return {
    street_address: street,
    street_number: streetNumber,
    route,
    unit,
    suburb,
    // short_name gives "QLD" rather than "Queensland", which is what the
    // state dropdowns are keyed on.
    state: shortName(list, "administrative_area_level_1"),
    state_long: longName(list, "administrative_area_level_1"),
    postcode: longName(list, "postal_code"),
    country: longName(list, "country"),
    country_code: shortName(list, "country"),
  };
}
