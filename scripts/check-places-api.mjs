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
  console.error(`FAILED — HTTP ${response.status} ${data?.error?.status || ""}`);
  console.error(data?.error?.message || "(no message)");
  console.error("\nUsual causes:");
  console.error('  PERMISSION_DENIED / "has not been used in project ... or it is disabled"');
  console.error("      → enable **Places API (New)** in the Google Cloud console.");
  console.error("        The legacy Places API is a separate product and does not cover this.");
  console.error("  REQUEST_DENIED / API key not valid");
  console.error("      → the key's API restrictions exclude Places API (New), or an");
  console.error("        HTTP-referrer restriction is set on a key used server-side");
  console.error("        (server keys must be unrestricted or IP-restricted, not referrer-restricted).");
  console.error("  RESOURCE_EXHAUSTED / billing");
  console.error("      → billing is not enabled on the project, or a quota cap was hit.");
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
