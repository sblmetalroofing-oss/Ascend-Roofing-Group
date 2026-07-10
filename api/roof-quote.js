import { Resend } from "resend";
import { verifyOrigin } from "../lib/verify-origin.js";
import {
  geocodeAddress,
  buildDisplayAddress,
  isSEQPostcode,
} from "../lib/geocode-address.js";
import { sanitize } from "../lib/sanitize.js";
import { rateLimit } from "../lib/rate-limit.js";

// ─── Configuration ────────────────────────────────────────
const CONFIG = {
  // Pricing
  BASE_RATE_PER_SQM: 100,
  HIGH_PITCH_SURCHARGE: 0.1,
  POOR_CONDITION_SURCHARGE: 0.15,
  COASTAL_SURCHARGE: 0.2,
  QUOTE_RANGE_FACTOR: 0.1,

  // Fallback estimate — used when Google Solar has no aerial roof data for the
  // address. TYPICAL_ROOF_SQM is a typical detached SEQ house roof footprint
  // (business assumption — tune as needed). The wider range factor reflects the
  // extra uncertainty of estimating without a real measurement.
  TYPICAL_ROOF_SQM: 200,
  FALLBACK_RANGE_FACTOR: 0.3,

  // Job type multipliers
  JOB_TYPE_MULTIPLIERS: {
    new_metal_install: 1.0,
    replacement: 1.15,
    repair: 0.5,
  },

  // Repair jobs: cap area to avoid inflated quotes for small patch jobs
  REPAIR_MAX_AREA_SQM: 50,
  JOB_TYPE_LABELS: {
    new_metal_install: "New Metal Install",
    replacement: "Replacement",
    repair: "Repair",
  },

  // Coastal postcodes — beachfront suburbs only
  COASTAL_POSTCODES: [
    [4217, 4218], // Surfers Paradise, Main Beach, Broadbeach, Mermaid Beach
    [4220, 4221], // Burleigh Heads, Miami, Palm Beach, Elanora
    [4223, 4225], // Coolangatta, Bilinga, Tugun, Currumbin
    [4507, 4507], // Bribie Island (Woorim, Bongaree, Banksia Beach)
  ],

  // Google Solar API
  GOOGLE_SOLAR_API_URL:
    "https://solar.googleapis.com/v1/buildingInsights:findClosest",
  GOOGLE_STATIC_MAP_URL:
    "https://maps.googleapis.com/maps/api/staticmap",

  // Frontend key for client-visible Static Maps URLs.
  // TODO(owner): rotate this key in Google Cloud Console — it has shipped in
  // git history and in client responses. Restrict the replacement to the
  // Static Maps API only, add an HTTP-referrer allow-list + daily quota cap,
  // then set it as GOOGLE_MAPS_FRONTEND_KEY in Vercel env vars (the fallback
  // below can be deleted once that's done).
  FRONTEND_API_KEY:
    process.env.GOOGLE_MAPS_FRONTEND_KEY ||
    "AIzaSyAtuH3SKAhvh-XI2sONazBTcEc6LycF4Zc",

  // Location notes
  LOCATION_NOTES: {
    coastal:
      "🌊 Coastal location detected — we recommend Colorbond® steel rated for coastal environments to ensure long-term corrosion resistance.",
    seq_default:
      "🏠 Recommended Colorbond® steel for superior SEQ storm durability and cyclone-rated fastening systems.",
  },

  // Shown when the estimate is based on a typical roof size rather than aerial data.
  TYPICAL_ESTIMATE_NOTE:
    "📐 Estimate based on a typical local roof size — Google aerial data wasn't available for this address. Your final price will be confirmed with a free on-site measurement.",

  // Disclaimers
  QUOTE_DISCLAIMER:
    "This is a rough estimate only based on aerial imagery analysis. A full, accurate quote requires an on-site inspection by our team. Prices are in AUD and include GST. Actual costs may vary depending on access, structural requirements, material selection, and council approvals.",
  PRIVACY_NOTICE:
    "Your information is collected in accordance with Australian Privacy Principles. We will only use your details to provide this quote and related roofing services. See our Privacy Policy for details.",
};

// ─── Helpers ──────────────────────────────────────────────

function isCoastalPostcode(postcode) {
  const pc = parseInt(postcode, 10);
  if (isNaN(pc)) return false;
  return CONFIG.COASTAL_POSTCODES.some(
    ([min, max]) => pc >= min && pc <= max,
  );
}

// Australia bounding box — used to reject client-supplied coordinates that are
// non-numeric (NaN) or implausible (spoofed / outside the country) before we
// spend a Google Solar API call on them.
const AU_BOUNDS = { latMin: -44, latMax: -10, lngMin: 112, lngMax: 154 };

// Validate client-provided coordinates. Returns { lat, lng } only when both
// parse to finite numbers inside Australia; otherwise null so the caller falls
// back to Nominatim geocoding.
function parseClientCoords(rawLat, rawLng) {
  const lat = parseFloat(rawLat);
  const lng = parseFloat(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < AU_BOUNDS.latMin || lat > AU_BOUNDS.latMax) return null;
  if (lng < AU_BOUNDS.lngMin || lng > AU_BOUNDS.lngMax) return null;
  return { lat, lng };
}

// Extract a QLD postcode (4xxx) from a free-text address. Prefer the code that
// follows a state token ("… QLD 4125"), since the real postcode trails the
// address; otherwise fall back to the LAST 4xxx token. Never take the first
// match — that is frequently a street/unit number (e.g. "4115 Mount Lindesay
// Hwy, Park Ridge QLD 4125" must resolve to 4125, not 4115).
function extractPostcode(address) {
  const str = String(address || "");
  const stateMatch = str.match(/(?:QLD|Queensland)[,\s]+(4\d{3})\b/i);
  if (stateMatch) return stateMatch[1];
  const all = str.match(/\b4\d{3}\b/g);
  return all && all.length ? all[all.length - 1] : "";
}

// ─── Input Validation ─────────────────────────────────────

function validateInputs(address, jobType, email) {
  if (!address || address.trim().length < 5) {
    return "Please enter a valid street address.";
  }
  if (address.length > 300) {
    return "Address is too long.";
  }
  if (!CONFIG.JOB_TYPE_MULTIPLIERS[jobType]) {
    return `Invalid job type. Must be one of: ${Object.keys(CONFIG.JOB_TYPE_MULTIPLIERS).join(", ")}`;
  }
  if (email) {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      return "Please enter a valid email address.";
    }
  }
  // XSS check
  const dangerous = ["<script", "javascript:", "onerror=", "onload="];
  for (const pattern of dangerous) {
    if (address.toLowerCase().includes(pattern)) {
      return "Invalid characters in address.";
    }
  }
  return null;
}

// ─── Google Solar API Integration ─────────────────────────

function getGoogleApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY || "";
}

async function getRoofData(lat, lng) {
  const apiKey = getGoogleApiKey();
  if (!apiKey) {
    return fallbackRoofData("Google Maps API key not configured");
  }

  const params = new URLSearchParams({
    "location.latitude": String(lat),
    "location.longitude": String(lng),
    // requiredQuality is a *minimum* threshold — "LOW" still returns the best
    // imagery Google has for the address while also covering locations that only
    // have low-quality coverage (common for outer SEQ suburbs). Maximizes the
    // number of addresses that get a real aerial measurement.
    requiredQuality: "LOW",
    key: apiKey,
  });

  try {
    const solarSignal = AbortSignal.timeout(10000);
    const resp = await fetch(`${CONFIG.GOOGLE_SOLAR_API_URL}?${params}`, {
      headers: { Accept: "application/json" },
      signal: solarSignal,
    });

    if (resp.ok) {
      return parseGoogleSolarResponse(await resp.json(), lat, lng, apiKey);
    }

    if (resp.status === 404) {
      return fallbackRoofData("No building data available at this location");
    }

    console.warn(`Google Solar API returned status ${resp.status}`);
    const errBody = await resp.text();
    console.warn("Response body:", errBody);
    return fallbackRoofData(`Google Solar API returned status ${resp.status}`);
  } catch (err) {
    console.error("Google Solar API request error:", err);
    return fallbackRoofData(String(err));
  }
}

function parseGoogleSolarResponse(data, lat, lng, apiKey) {
  try {
    const solar = data.solarPotential;
    if (!solar) {
      return fallbackRoofData("No solar potential data in API response");
    }

    // Area — use wholeRoofStats (actual roof area accounting for tilt)
    const wholeRoof = solar.wholeRoofStats || {};
    const areaSqm = wholeRoof.areaMeters2
      ? Math.round(parseFloat(wholeRoof.areaMeters2) * 10) / 10
      : 0;

    // Pitch — use the largest roof segment (main roof) rather than
    // a weighted average, which can be skewed by flat carports/garages
    const segments = solar.roofSegmentStats || [];
    let pitchDegrees = null;
    let pitch = "unknown";

    if (segments.length > 0) {
      let largestArea = 0;
      let mainPitch = 0;
      for (const seg of segments) {
        const segArea =
          seg.stats && seg.stats.areaMeters2 ? seg.stats.areaMeters2 : 0;
        if (segArea > largestArea) {
          largestArea = segArea;
          mainPitch =
            typeof seg.pitchDegrees === "number" ? seg.pitchDegrees : 0;
        }
      }
      if (largestArea > 0) {
        pitchDegrees = Math.round(mainPitch * 10) / 10;
        pitch = pitchDegrees > 25 ? "high" : pitchDegrees > 15 ? "medium" : "low";
      }
    }

    // Condition & material — not provided by Google Solar API
    const condition = "unknown";
    const material = "Unknown";

    // Satellite image via Google Maps Static API (use frontend key to avoid leaking server key)
    const imageParams = new URLSearchParams({
      center: `${lat},${lng}`,
      zoom: "20",
      size: "600x400",
      maptype: "satellite",
      key: CONFIG.FRONTEND_API_KEY,
    });
    const imageUrl = `${CONFIG.GOOGLE_STATIC_MAP_URL}?${imageParams}`;

    return {
      has_data: true,
      area_sqm: areaSqm,
      area_sqft: areaSqm ? Math.round(areaSqm * 10.7639 * 10) / 10 : null,
      condition,
      condition_score: null,
      pitch,
      pitch_degrees: pitchDegrees,
      material,
      image_url: imageUrl,
      source: "Google Solar API",
    };
  } catch (err) {
    console.error("Error parsing Google Solar response:", err);
    return fallbackRoofData(`Error parsing roof data: ${err}`);
  }
}

function fallbackRoofData(reason = "") {
  console.log(`Using fallback roof data: ${reason}`);
  return {
    has_data: false,
    area_sqm: null,
    condition: "unknown",
    pitch: "unknown",
    material: "Unknown",
    image_url: null,
    source: null,
    no_coverage_reason: reason,
    message:
      "No aerial roof data available for this address. Please schedule a free on-site inspection for an accurate quote.",
  };
}

// ─── Quote Calculation ────────────────────────────────────

function calculateQuote(roofData, jobType, postcode) {
  // When Google Solar has no aerial measurement, fall back to a typical roof
  // size so the customer still gets a ballpark range instead of no estimate.
  // Pitch/condition are unknown in this mode, so those surcharges are skipped.
  const isTypical = !roofData.has_data || !roofData.area_sqm;
  const rawArea = isTypical ? CONFIG.TYPICAL_ROOF_SQM : roofData.area_sqm;

  // For repairs, cap area so quotes aren't inflated for small patch jobs
  const areaSqm =
    jobType === "repair"
      ? Math.min(rawArea, CONFIG.REPAIR_MAX_AREA_SQM)
      : rawArea;
  const pitch = isTypical ? "unknown" : roofData.pitch || "unknown";
  const condition = isTypical ? "unknown" : roofData.condition || "unknown";

  // Base
  let base = areaSqm * CONFIG.BASE_RATE_PER_SQM;
  const multiplier = CONFIG.JOB_TYPE_MULTIPLIERS[jobType] || 1.0;
  base *= multiplier;

  // Surcharges
  const surcharges = [];
  let surchargeTotal = 0;

  if (pitch === "high") {
    const sc = base * CONFIG.HIGH_PITCH_SURCHARGE;
    surchargeTotal += sc;
    surcharges.push({
      name: "High Pitch Surcharge",
      rate: `+${Math.round(CONFIG.HIGH_PITCH_SURCHARGE * 100)}%`,
      amount: Math.round(sc * 100) / 100,
    });
  }

  if (condition === "poor") {
    const sc = base * CONFIG.POOR_CONDITION_SURCHARGE;
    surchargeTotal += sc;
    surcharges.push({
      name: "Poor Condition Surcharge",
      rate: `+${Math.round(CONFIG.POOR_CONDITION_SURCHARGE * 100)}%`,
      amount: Math.round(sc * 100) / 100,
    });
  }

  const coastal = isCoastalPostcode(postcode);
  if (coastal) {
    const sc = base * CONFIG.COASTAL_SURCHARGE;
    surchargeTotal += sc;
    surcharges.push({
      name: "Coastal Location Surcharge",
      rate: `+${Math.round(CONFIG.COASTAL_SURCHARGE * 100)}%`,
      amount: Math.round(sc * 100) / 100,
    });
  }

  const total = base + surchargeTotal;
  const rangeFactor = isTypical
    ? CONFIG.FALLBACK_RANGE_FACTOR
    : CONFIG.QUOTE_RANGE_FACTOR;
  const low = Math.round(total * (1 - rangeFactor) * 100) / 100;
  const high = Math.round(total * (1 + rangeFactor) * 100) / 100;

  const notes = isTypical
    ? [CONFIG.TYPICAL_ESTIMATE_NOTE, getLocationNote(postcode, coastal)]
    : [getLocationNote(postcode, coastal)];

  return {
    available: true,
    estimate_basis: isTypical ? "typical" : "aerial",
    area_sqm: areaSqm,
    base_rate_per_sqm: CONFIG.BASE_RATE_PER_SQM,
    job_type_multiplier: multiplier,
    base_amount: Math.round(base * 100) / 100,
    surcharges,
    surcharge_total: Math.round(surchargeTotal * 100) / 100,
    estimated_total: Math.round(total * 100) / 100,
    range_low: low,
    range_high: high,
    currency: "AUD",
    notes,
  };
}

function getLocationNote(postcode, coastal = false) {
  if (coastal || isCoastalPostcode(postcode)) {
    return CONFIG.LOCATION_NOTES.coastal;
  }
  return CONFIG.LOCATION_NOTES.seq_default;
}

// ─── Lead Capture ─────────────────────────────────────────

async function captureLead({ email, firstName, lastName, phone, address, jobType, quote, roof }) {
  const jobLabel = CONFIG.JOB_TYPE_LABELS[jobType] || jobType;
  const quoteRange = quote.available
    ? `$${Math.round(quote.range_low).toLocaleString()} – $${Math.round(quote.range_high).toLocaleString()} AUD`
    : "Manual quote required";
  const fullName = `${firstName} ${lastName}`.trim();

  // Lead details intentionally not logged to avoid PII in Vercel logs.
  // Notification is delivered via Resend email below.

  // Send notification email via Resend if configured
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);

      // Build roof analysis section
      const roofSection = roof && roof.has_data
        ? `<h3 style="color:#e67e22; margin:24px 0 12px;">Roof Analysis</h3>
           <table style="border-collapse:collapse; width:100%; max-width:500px;">
             <tr>
               <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Roof Area</td>
               <td style="padding:8px; border:1px solid #ddd;">${sanitize(String(roof.area_sqm))} m²</td>
             </tr>
             <tr>
               <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Roof Pitch</td>
               <td style="padding:8px; border:1px solid #ddd;">${sanitize(roof.pitch ? roof.pitch.charAt(0).toUpperCase() + roof.pitch.slice(1) : "Unknown")}${roof.pitch_degrees != null ? ` (${sanitize(String(roof.pitch_degrees))}°)` : ""}</td>
             </tr>
             <tr>
               <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Data Source</td>
               <td style="padding:8px; border:1px solid #ddd;">${sanitize(roof.source || "N/A")}</td>
             </tr>
           </table>`
        : "";

      // Build quote breakdown section
      let quoteSection = "";
      if (quote.available) {
        const fmt = (n) => `$${Math.round(n).toLocaleString()}`;

        let breakdownRows = `
          <tr>
            <td style="padding:8px; border:1px solid #ddd;">Base (${sanitize(String(quote.area_sqm))} m² × $${quote.base_rate_per_sqm}/m²)</td>
            <td style="padding:8px; border:1px solid #ddd; text-align:right;">${sanitize(fmt(quote.base_amount / quote.job_type_multiplier))}</td>
          </tr>`;

        if (quote.job_type_multiplier !== 1.0) {
          breakdownRows += `
          <tr>
            <td style="padding:8px; border:1px solid #ddd;">Job type multiplier</td>
            <td style="padding:8px; border:1px solid #ddd; text-align:right;">×${sanitize(String(quote.job_type_multiplier))}</td>
          </tr>`;
        }

        for (const sc of quote.surcharges) {
          breakdownRows += `
          <tr>
            <td style="padding:8px; border:1px solid #ddd; color:#e67e22;">${sanitize(sc.name)} (${sanitize(sc.rate)})</td>
            <td style="padding:8px; border:1px solid #ddd; text-align:right; color:#e67e22;">+${sanitize(fmt(sc.amount))}</td>
          </tr>`;
        }

        breakdownRows += `
          <tr>
            <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Estimated Total</td>
            <td style="padding:8px; border:1px solid #ddd; text-align:right; font-weight:bold;">${sanitize(fmt(quote.estimated_total))}</td>
          </tr>`;

        const typicalDisclaimer =
          quote.estimate_basis === "typical"
            ? `<p style="font-size:13px; font-style:italic; text-align:center; color:#777; margin:0 0 12px;">
                Based on a typical local roof size — Google aerial data wasn't available for this address.
              </p>`
            : "";

        quoteSection = `
          <h3 style="color:#e67e22; margin:24px 0 12px;">Estimated Quote</h3>
          <p style="font-size:20px; font-weight:bold; text-align:center; margin:12px 0;">
            ${sanitize(quoteRange)} <span style="font-size:14px; font-weight:normal;">(incl. GST)</span>
          </p>
          ${typicalDisclaimer}
          <table style="border-collapse:collapse; width:100%; max-width:500px;">
            ${breakdownRows}
          </table>`;
      } else {
        quoteSection = `
          <h3 style="color:#e67e22; margin:24px 0 12px;">Estimated Quote</h3>
          <p>Manual quote required — no automated estimate available.</p>`;
      }

      // Build notes section
      const notesHtml = quote.notes && quote.notes.length > 0
        ? `<h3 style="color:#e67e22; margin:24px 0 12px;">Recommendations</h3>
           <ul style="margin:0; padding-left:20px;">${quote.notes.map((n) => `<li style="padding:4px 0;">${sanitize(n)}</li>`).join("")}</ul>`
        : "";

      await resend.emails.send({
        from:
          process.env.FROM_EMAIL || "Ascend Website <onboarding@resend.dev>",
        to: process.env.BUSINESS_EMAIL || "admin@ascendroofinggroup.com.au",
        replyTo: email,
        subject: `🏠 New Roof Quote Lead: ${sanitize(fullName)} — ${sanitize(address)}`,
        html: `
          <h2>New AI Roof Quote Lead</h2>
          <h3 style="color:#e67e22; margin:24px 0 12px;">Customer Details</h3>
          <table style="border-collapse:collapse; width:100%; max-width:500px;">
            <tr>
              <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Name</td>
              <td style="padding:8px; border:1px solid #ddd;">${sanitize(fullName)}</td>
            </tr>
            <tr>
              <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Phone</td>
              <td style="padding:8px; border:1px solid #ddd;">${sanitize(phone)}</td>
            </tr>
            <tr>
              <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Email</td>
              <td style="padding:8px; border:1px solid #ddd;">${sanitize(email)}</td>
            </tr>
            <tr>
              <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Address</td>
              <td style="padding:8px; border:1px solid #ddd;">${sanitize(address)}</td>
            </tr>
            <tr>
              <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Job Type</td>
              <td style="padding:8px; border:1px solid #ddd;">${sanitize(jobLabel)}</td>
            </tr>
          </table>
          ${roofSection}
          ${quoteSection}
          ${notesHtml}
        `,
      });
      console.log("Lead notification email sent successfully");
    } catch (err) {
      console.error("Failed to send lead notification email:", err);
    }
  }
}

// ─── Main Handler ─────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!verifyOrigin(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Server-side rate limit by IP (durable when Upstash is configured);
  // limits cost exposure on Google Solar API + Resend.
  const rl = await rateLimit(req, { name: "roof-quote", limit: 1, windowMs: 5 * 60 * 1000 });
  if (rl.limited) {
    res.setHeader("Retry-After", String(rl.retryAfter));
    return res.status(429).json({
      error: "Too many quote requests. Please wait before trying again.",
    });
  }

  const {
    address,
    job_type: jobType,
    email,
    first_name: firstName,
    last_name: lastName,
    phone,
    lat: clientLat,
    lng: clientLng,
  } = req.body || {};
  const cleanAddress = (address || "").trim();
  const cleanJobType = (jobType || "").trim();
  const cleanEmail = (email || "").trim();
  const cleanFirstName = (firstName || "").trim();
  const cleanLastName = (lastName || "").trim();
  const cleanPhone = (phone || "").trim();

  // Validate
  const validationError = validateInputs(
    cleanAddress,
    cleanJobType,
    cleanEmail,
  );
  if (validationError) {
    return res.status(422).json({ error: validationError });
  }

  // Step 1: Use client coordinates if provided (from Google autocomplete),
  // otherwise fall back to Nominatim geocoding
  let lat, lng, postcode;
  // Suburb known only via Nominatim; on the client-coords path the suburb is
  // already part of cleanAddress (Google formatted_address), so leave it blank.
  let suburb = "";

  const clientCoords = parseClientCoords(clientLat, clientLng);
  if (clientCoords) {
    lat = clientCoords.lat;
    lng = clientCoords.lng;
    // Postcode is taken from the address string (e.g. "QLD 4118"); the trusted
    // value comes from after the state token, never the first 4xxx token.
    postcode = extractPostcode(cleanAddress);
    console.log(
      `Using client coordinates: (${lat}, ${lng}) postcode=${postcode}`,
    );
  } else {
    const geoResult = await geocodeAddress(cleanAddress);
    if (geoResult.error) {
      return res.status(404).json({
        error: geoResult.error,
        suggestion:
          "Please enter a valid street address in South East Queensland.",
      });
    }
    lat = geoResult.lat;
    lng = geoResult.lng;
    postcode = geoResult.postcode;
    suburb = geoResult.suburb || "";
    console.log(
      `Geocoded: ${geoResult.formatted_address} → (${lat}, ${lng}) postcode=${postcode}`,
    );
  }

  // Enrich the address so the lead email/results always carry the suburb,
  // even when the customer typed the address without picking a suggestion.
  const displayAddress = buildDisplayAddress(cleanAddress, { suburb, postcode });

  // Verify SEQ postcode before spending a Google Solar API call. A missing
  // postcode used to skip this check entirely, letting out-of-area
  // coordinates consume paid Solar quota.
  if (!postcode) {
    return res.status(422).json({
      error:
        "We couldn't determine the postcode for that address. Please include your postcode (e.g. 'QLD 4000') and try again.",
    });
  }
  if (!isSEQPostcode(postcode)) {
    return res.status(422).json({
      error: `Postcode ${postcode} is outside our primary service area. We service Brisbane, Gold Coast, Logan, Ipswich, and Moreton Bay regions.`,
    });
  }

  // Step 2: Google Solar roof data
  const roofData = await getRoofData(lat, lng);

  // Step 3: Calculate quote
  const quote = calculateQuote(roofData, cleanJobType, postcode);

  // Step 4: Build response
  const response = {
    success: true,
    address: displayAddress,
    coordinates: { lat, lng },
    postcode,
    job_type: CONFIG.JOB_TYPE_LABELS[cleanJobType] || cleanJobType,
    roof: roofData,
    quote,
    disclaimers: [CONFIG.QUOTE_DISCLAIMER, CONFIG.PRIVACY_NOTICE],
    generated_at: new Date().toISOString(),
  };

  const schedulerUrl = process.env.SCHEDULER_URL;
  if (schedulerUrl) {
    response.scheduler_url = schedulerUrl;
  }

  // Step 5: Lead capture (always capture leads with contact info)
  if (cleanEmail || cleanPhone) {
    await captureLead({
      email: cleanEmail,
      firstName: cleanFirstName,
      lastName: cleanLastName,
      phone: cleanPhone,
      address: displayAddress,
      jobType: cleanJobType,
      quote,
      roof: roofData,
    });
  }

  return res.status(200).json(response);
}
