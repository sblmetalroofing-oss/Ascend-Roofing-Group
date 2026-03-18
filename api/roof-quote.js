import { Resend } from "resend";

// ─── Configuration ────────────────────────────────────────
const CONFIG = {
  // Pricing
  BASE_RATE_PER_SQM: 100,
  HIGH_PITCH_SURCHARGE: 0.1,
  POOR_CONDITION_SURCHARGE: 0.15,
  COASTAL_SURCHARGE: 0.2,
  QUOTE_RANGE_FACTOR: 0.1,

  // Job type multipliers
  JOB_TYPE_MULTIPLIERS: {
    new_metal_install: 1.0,
    replacement: 1.15,
    repair: 0.5,
  },
  JOB_TYPE_LABELS: {
    new_metal_install: "New Metal Install",
    replacement: "Replacement",
    repair: "Repair",
  },

  // Coastal postcodes (Gold Coast region)
  COASTAL_POSTCODE_MIN: 4200,
  COASTAL_POSTCODE_MAX: 4299,

  // SEQ service area
  SEQ_POSTCODE_MIN: 4000,
  SEQ_POSTCODE_MAX: 4600,

  // Google Solar API
  GOOGLE_SOLAR_API_URL:
    "https://solar.googleapis.com/v1/buildingInsights:findClosest",
  GOOGLE_STATIC_MAP_URL:
    "https://maps.googleapis.com/maps/api/staticmap",

  // Location notes
  LOCATION_NOTES: {
    coastal:
      "🌊 Coastal location detected — we recommend Colorbond® Ultra for superior corrosion resistance in salt-air environments.",
    seq_default:
      "🏠 Recommended Colorbond® steel for superior SEQ storm durability and cyclone-rated fastening systems.",
  },

  // Disclaimers
  QUOTE_DISCLAIMER:
    "This is a rough estimate only based on aerial imagery analysis. A full, accurate quote requires an on-site inspection by our team. Prices are in AUD and include GST. Actual costs may vary depending on access, structural requirements, material selection, and council approvals.",
  PRIVACY_NOTICE:
    "Your information is collected in accordance with Australian Privacy Principles. We will only use your details to provide this quote and related roofing services. See our Privacy Policy for details.",
};

// ─── Helpers ──────────────────────────────────────────────

function sanitize(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function isCoastalPostcode(postcode) {
  const pc = parseInt(postcode, 10);
  return (
    !isNaN(pc) &&
    pc >= CONFIG.COASTAL_POSTCODE_MIN &&
    pc <= CONFIG.COASTAL_POSTCODE_MAX
  );
}

function isSEQPostcode(postcode) {
  const pc = parseInt(postcode, 10);
  return (
    !isNaN(pc) && pc >= CONFIG.SEQ_POSTCODE_MIN && pc <= CONFIG.SEQ_POSTCODE_MAX
  );
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

// ─── Geocoding (Nominatim / OpenStreetMap) ────────────────

async function geocodeAddress(address) {
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
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: {
          "User-Agent":
            "AscendRoofingQuoteGenerator/1.0 (admin@ascendroofinggroup.com.au)",
          Accept: "application/json",
        },
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
    requiredQuality: "MEDIUM",
    key: apiKey,
  });

  try {
    const resp = await fetch(`${CONFIG.GOOGLE_SOLAR_API_URL}?${params}`, {
      headers: { Accept: "application/json" },
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

    // Pitch — weighted average across roof segments
    const segments = solar.roofSegmentStats || [];
    let pitchDegrees = null;
    let pitch = "unknown";

    if (segments.length > 0) {
      let totalArea = 0;
      let weightedPitch = 0;
      for (const seg of segments) {
        const segArea =
          seg.stats && seg.stats.areaMeters2 ? seg.stats.areaMeters2 : 0;
        const segPitch =
          typeof seg.pitchDegrees === "number" ? seg.pitchDegrees : 0;
        weightedPitch += segPitch * segArea;
        totalArea += segArea;
      }
      if (totalArea > 0) {
        pitchDegrees = Math.round((weightedPitch / totalArea) * 10) / 10;
        pitch = pitchDegrees > 25 ? "high" : pitchDegrees > 15 ? "medium" : "low";
      }
    }

    // Condition & material — not provided by Google Solar API
    const condition = "unknown";
    const material = "Unknown";

    // Satellite image via Google Maps Static API
    const imageParams = new URLSearchParams({
      center: `${lat},${lng}`,
      zoom: "20",
      size: "600x400",
      maptype: "satellite",
      key: apiKey,
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
  if (!roofData.has_data || !roofData.area_sqm) {
    return {
      available: false,
      message:
        "Unable to calculate an automated quote without roof measurements. Please book a free on-site inspection for an accurate quote.",
      notes: [getLocationNote(postcode)],
    };
  }

  const areaSqm = roofData.area_sqm;
  const pitch = roofData.pitch || "unknown";
  const condition = roofData.condition || "unknown";

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
  const low = Math.round(total * (1 - CONFIG.QUOTE_RANGE_FACTOR) * 100) / 100;
  const high = Math.round(total * (1 + CONFIG.QUOTE_RANGE_FACTOR) * 100) / 100;

  return {
    available: true,
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
    notes: [getLocationNote(postcode, coastal)],
  };
}

function getLocationNote(postcode, coastal = false) {
  if (coastal || isCoastalPostcode(postcode)) {
    return CONFIG.LOCATION_NOTES.coastal;
  }
  return CONFIG.LOCATION_NOTES.seq_default;
}

// ─── Lead Capture ─────────────────────────────────────────

async function captureLead(email, address, jobType, quote) {
  const jobLabel = CONFIG.JOB_TYPE_LABELS[jobType] || jobType;
  const quoteRange = quote.available
    ? `$${Math.round(quote.range_low).toLocaleString()} – $${Math.round(quote.range_high).toLocaleString()} AUD`
    : "Manual quote required";

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  📧 NEW ROOF QUOTE LEAD — ${new Date().toISOString()}`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  Email:    ${email}`);
  console.log(`  Address:  ${address}`);
  console.log(`  Job Type: ${jobLabel}`);
  console.log(`  Quote:    ${quoteRange}`);
  console.log(`${"=".repeat(60)}\n`);

  // Send notification email via Resend if configured
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from:
          process.env.FROM_EMAIL || "Ascend Website <onboarding@resend.dev>",
        to: process.env.BUSINESS_EMAIL || "admin@ascendroofinggroup.com.au",
        replyTo: email,
        subject: `🏠 New Roof Quote Lead: ${sanitize(address)}`,
        html: `
                    <h2>New AI Roof Quote Lead</h2>
                    <table style="border-collapse:collapse; width:100%; max-width:500px;">
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
                        <tr>
                            <td style="padding:8px; border:1px solid #ddd; font-weight:bold;">Estimated Quote</td>
                            <td style="padding:8px; border:1px solid #ddd;">${sanitize(quoteRange)}</td>
                        </tr>
                    </table>
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

  const { address, job_type: jobType, email } = req.body || {};
  const cleanAddress = (address || "").trim();
  const cleanJobType = (jobType || "").trim();
  const cleanEmail = (email || "").trim();

  // Validate
  const validationError = validateInputs(
    cleanAddress,
    cleanJobType,
    cleanEmail,
  );
  if (validationError) {
    return res.status(422).json({ error: validationError });
  }

  // Step 1: Geocode
  const geoResult = await geocodeAddress(cleanAddress);
  if (geoResult.error) {
    return res.status(404).json({
      error: geoResult.error,
      suggestion:
        "Please enter a valid street address in South East Queensland.",
    });
  }

  const { lat, lng, postcode, formatted_address: formattedAddress } = geoResult;
  console.log(
    `Geocoded: ${formattedAddress} → (${lat}, ${lng}) postcode=${postcode}`,
  );

  // Step 2: Google Solar roof data
  const roofData = await getRoofData(lat, lng);

  // Step 3: Calculate quote
  const quote = calculateQuote(roofData, cleanJobType, postcode);

  // Step 4: Build response
  const response = {
    success: true,
    address: formattedAddress,
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

  // Step 5: Lead capture
  if (cleanEmail) {
    await captureLead(cleanEmail, formattedAddress, cleanJobType, quote);
  }

  return res.status(200).json(response);
}
