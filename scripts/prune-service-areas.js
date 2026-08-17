// Prunes the suburb pages down to a keep-list, redirecting what it removes.
//
// docs/page-indexing-report.md §4 option 2: 314 thin pages index worse than a
// smaller set of rich ones, and the pages you drop were mostly not indexed
// anyway. The ceiling to aim under is the distinct-body count from
// `npm run check:uniqueness` — pruning to fewer pages than you have distinct
// copy for is what actually lifts the indexed figure. Pruning to more than
// that just moves the duplicates around.
//
// Removed suburbs are never deleted silently: each one gets a 301 in
// vercel.json to the closest page still standing, so existing links and any
// ranking they carry land somewhere relevant rather than on a 404.
//
// The keep-list lives in service-areas/keep.json — a JSON array of slugs
// ("roofing-ascot" or "ascot", both accepted). Which suburbs belong on it is a
// business call: drive it from Search Console performance (Pages, sorted by
// impressions) or from the areas that actually convert, not from this script.
//
// Dry run by default — it prints the plan and changes nothing:
//   npm run prune:service-areas
//   npm run prune:service-areas -- --apply
//
// After --apply, run `npm run build` to regenerate locations.html and the
// sitemap, then `npm run check:indexing`.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(__filename));

export const slugOf = (name) =>
  "roofing-" +
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// Accepts "ascot", "roofing-ascot" or "service-areas/roofing-ascot.html", so a
// keep-list pasted out of Search Console does not need reformatting first.
export function normaliseKeepEntry(entry) {
  const base = path.basename(String(entry).trim(), ".html");
  return base.startsWith("roofing-") ? base : slugOf(base);
}

export function readKeepList(root = ROOT) {
  const file = path.join(root, "service-areas", "keep.json");
  if (!fs.existsSync(file)) return null;
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("keep.json must be a JSON array of suburb slugs.");
  return new Set(parsed.map(normaliseKeepEntry));
}

// Where a removed suburb should send its traffic. Same postcode is the only
// genuinely "nearby" signal in suburbs.json — regions are large — so it wins;
// otherwise any kept suburb in the same region, and failing that the hub.
export function redirectTargetFor(suburb, kept, suburbs) {
  const sameCode = suburbs
    .filter((s) => s.postcode === suburb.postcode && kept.has(slugOf(s.name)))
    .map((s) => slugOf(s.name))
    .sort();
  if (sameCode.length) return `/service-areas/${sameCode[0]}.html`;

  const sameRegion = suburbs
    .filter((s) => s.region === suburb.region && kept.has(slugOf(s.name)))
    .map((s) => slugOf(s.name))
    .sort();
  if (sameRegion.length) return `/service-areas/${sameRegion[0]}.html`;

  return "/locations.html";
}

export function planPrune(root = ROOT) {
  const suburbs = JSON.parse(fs.readFileSync(path.join(root, "suburbs.json"), "utf8"));
  const kept = readKeepList(root);
  if (!kept) return null;

  const known = new Set(suburbs.map((s) => slugOf(s.name)));
  const unknown = [...kept].filter((s) => !known.has(s)).sort();

  const removals = suburbs
    .filter((s) => !kept.has(slugOf(s.name)))
    .map((s) => ({
      slug: slugOf(s.name),
      name: s.name,
      source: `/service-areas/${slugOf(s.name)}.html`,
      destination: redirectTargetFor(s, kept, suburbs),
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  return { total: suburbs.length, keeping: suburbs.length - removals.length, removals, unknown };
}

// ---------------------------------------------------------------------- apply

// Redirects are inserted ahead of the existing rules so the catch-all
// /roofing-(.*).html rule cannot claim a pruned suburb first. Re-running
// replaces the managed block rather than stacking duplicates onto it.
export function applyPrune(plan, root = ROOT) {
  const removed = [];
  for (const r of plan.removals) {
    const file = path.join(root, "service-areas", `${r.slug}.html`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      removed.push(r.slug);
    }
  }

  const vercelPath = path.join(root, "vercel.json");
  const vercel = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
  const managed = new Set(plan.removals.map((r) => r.source));
  const existing = (vercel.redirects || []).filter((r) => !managed.has(r.source));

  vercel.redirects = [
    ...plan.removals.map((r) => ({
      source: r.source,
      destination: r.destination,
      permanent: true,
    })),
    ...existing,
  ];

  fs.writeFileSync(vercelPath, JSON.stringify(vercel, null, 2) + "\n");

  // suburbs.json drives the build, so a pruned suburb has to leave it too or
  // the next `npm run build` puts the page straight back.
  const suburbsPath = path.join(root, "suburbs.json");
  const suburbs = JSON.parse(fs.readFileSync(suburbsPath, "utf8"));
  const dropped = new Set(plan.removals.map((r) => r.slug));
  const remaining = suburbs.filter((s) => !dropped.has(slugOf(s.name)));
  fs.writeFileSync(suburbsPath, JSON.stringify(remaining, null, 4) + "\n");

  return { removed, redirects: plan.removals.length, suburbsRemaining: remaining.length };
}

// ------------------------------------------------------------------- runner

if (process.argv[1] && fs.realpathSync(process.argv[1]) === __filename) {
  const plan = planPrune();

  if (!plan) {
    console.error(
      "No service-areas/keep.json found.\n\n" +
        "Create one listing the suburbs to keep, e.g.\n" +
        '  ["ascot", "bulimba", "southport"]\n\n' +
        "Drive the list from Search Console (Pages, sorted by impressions) or\n" +
        "from the areas that actually convert. Aim for no more pages than the\n" +
        "distinct-body count reported by `npm run check:uniqueness`.",
    );
    process.exitCode = 1;
  } else if (plan.unknown.length) {
    console.error(
      `keep.json lists ${plan.unknown.length} suburb(s) with no page in suburbs.json:\n` +
        plan.unknown.map((s) => `  - ${s}`).join("\n") +
        "\n\nFix the names, or remove them from the list.",
    );
    process.exitCode = 1;
  } else if (!process.argv.includes("--apply")) {
    console.log(
      `Dry run — nothing changed.\n\n` +
        `Keeping  : ${plan.keeping} of ${plan.total} suburb pages\n` +
        `Removing : ${plan.removals.length} (each gets a 301 to the closest page kept)\n`,
    );
    for (const r of plan.removals.slice(0, 15)) {
      console.log(`  ${r.source}  ->  ${r.destination}`);
    }
    if (plan.removals.length > 15) {
      console.log(`  ... and ${plan.removals.length - 15} more`);
    }
    console.log(`\nRe-run with --apply to carry it out.`);
  } else {
    const result = applyPrune(plan);
    console.log(
      `Removed ${result.removed.length} page(s), wrote ${result.redirects} redirect(s), ` +
        `${result.suburbsRemaining} suburb(s) left in suburbs.json.\n\n` +
        `Next: npm run build && npm run check:indexing && npm run check:uniqueness`,
    );
  }
}
