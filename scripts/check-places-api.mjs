#!/usr/bin/env node
/**
 * Diagnose the address autocomplete from the command line.
 *
 * The browser only ever sees an empty dropdown, so when suggestions stop
 * appearing there is no way to tell a disabled Google API from a rejected key
 * from a billing lapse. This calls the same Places API (New) endpoint that
 * api/places-autocomplete.js uses and prints Google's verbatim answer.
 *
 *   GOOGLE_MAPS_API_KEY=AIza... node scripts/check-places-api.mjs "13 mahog"
 *
 * On Vercel: `vercel env pull .env.local`, then
 *   node --env-file=.env.local scripts/check-places-api.mjs "13 mahog"
 */

const input = process.argv.slice(2).join(" ").trim() || "13 mahogany";
const apiKey = process.env.GOOGLE_MAPS_API_KEY;

if (!apiKey) {
  console.error("GOOGLE_MAPS_API_KEY is not set in this shell.");
  console.error("The deployed endpoint answers 500 NOT_CONFIGURED in exactly this case.");
  process.exit(1);
}

console.log(`Querying Places API (New) for: "${input}"\n`);

let response;
try {
  response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify({ input, includedRegionCodes: ["au"] }),
    signal: AbortSignal.timeout(10000),
  });
} catch (err) {
  console.error(`Could not reach Google: ${err.name} — ${err.message}`);
  process.exit(1);
}

const data = await response.json().catch(() => null);

if (!response.ok) {
  const message = data?.error?.message || "(no message)";
  console.error(`FAILED — HTTP ${response.status} ${data?.error?.status || ""}`);
  console.error(message);

  // Google uses two different messages for two different misconfigurations,
  // and they need opposite fixes. Name the right one rather than listing both.
  if (/are blocked/i.test(message)) {
    console.error("\n→ The API is enabled on the project, but THIS KEY is not allowed to call it.");
    console.error("  Google Cloud console → APIs & Services → Credentials → open this key");
    console.error("  → API restrictions. Either pick 'Don't restrict key', or add");
    console.error("  'Places API (New)' to the selected-APIs list. Note that the entry named");
    console.error("  plain 'Places API' is the legacy product and does NOT cover this call.");
    console.error("  Changes take a minute or two to propagate.");
  } else if (/has not been used in project|is disabled/i.test(message)) {
    console.error("\n→ Places API (New) is not enabled on the project.");
    console.error("  Enable it at the console URL in the message above.");
    console.error("  The legacy 'Places API' is a separate product and does not cover this.");
  } else if (/referer|referrer/i.test(message)) {
    console.error("\n→ The key carries an HTTP-referrer restriction. Server-to-server calls");
    console.error("  send no referrer, so they can never satisfy it. Use an unrestricted or");
    console.error("  IP-restricted key for GOOGLE_MAPS_API_KEY.");
  } else if (response.status === 429 || /RESOURCE_EXHAUSTED/i.test(message)) {
    console.error("\n→ Billing is not enabled on the project, or a quota cap was hit.");
  }
  process.exit(1);
}

const predictions = (data?.suggestions || [])
  .map((s) => s.placePrediction)
  .filter(Boolean)
  .map((p) => p.text?.text)
  .filter(Boolean);

console.log(`OK — HTTP ${response.status}, ${predictions.length} suggestion(s):`);
for (const p of predictions) console.log(`  · ${p}`);

if (!predictions.length) {
  console.log("\nGoogle accepted the request but matched nothing.");
  console.log("The key and API are fine; try a more complete address.");
}
