// Measures how many of the suburb pages are genuinely distinct documents.
//
// docs/page-indexing-report.md §4 names near-duplicate suburb pages as the real
// indexing risk on this site, and says to track that number over time. Until
// now the only way to get it was to filter Search Console by hand, weeks after
// the fact. This computes it from the repo, today.
//
// The number that matters is the *distinct body count*. Google will not index
// two pages that say the same thing, so the count of distinct bodies is a
// ceiling on how many suburb pages can ever be indexed at once — no amount of
// sitemap or canonical work raises it. Compare it against the "indexed" figure
// in the Page indexing report: when the two are close, duplication is the
// binding constraint, and only new content moves it.
//
// This is a measurement, not an invariant, so it never fails by default —
// check:indexing owns pass/fail. Pass --max-cluster=N to enforce a ceiling
// once you have one worth holding.
//
// Run directly:  npm run check:uniqueness
//                npm run check:uniqueness -- --json

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(__filename));

const SERVICE_AREAS = path.join(ROOT, "service-areas");

// ------------------------------------------------------------- normalisation

// Everything a page says once the place-specific tokens are taken out. Two
// pages that normalise to the same string differ only by name and postcode,
// which is exactly the similarity Google collapses.
//
// Scripts, styles and the neighbour-link grid are dropped rather than
// normalised: the grid is generated from the suburb list, so leaving it in
// would make every page look unique for a reason no reader benefits from.
export function normaliseBody(html, suburbNames) {
  let text = html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<a\s+href="roofing-[^"]*"[\s\S]*?<\/a>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  // Longest first, so "Mount Gravatt East" is replaced before "Mount Gravatt".
  const byLength = [...suburbNames].sort((a, b) => b.length - a.length);
  for (const name of byLength) {
    text = text.split(name).join(" ");
  }

  return text
    .replace(/\b\d{4}\b/g, "") // postcodes
    .replace(/\s+/g, " ")
    .trim();
}

export function readSuburbNames(root = ROOT) {
  const raw = fs.readFileSync(path.join(root, "suburbs.json"), "utf8");
  return JSON.parse(raw).map((s) => s.name);
}

export function listSuburbPages(dir = SERVICE_AREAS) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("roofing-") && f.endsWith(".html"))
    .sort()
    .map((f) => path.join(dir, f));
}

// ---------------------------------------------------------------- clustering

// Groups pages by normalised body. Each group is a set of pages Google has no
// reason to index more than one of.
export function clusterPages(root = ROOT) {
  const suburbNames = readSuburbNames(root);
  const clusters = new Map();

  for (const file of listSuburbPages(path.join(root, "service-areas"))) {
    const body = normaliseBody(fs.readFileSync(file, "utf8"), suburbNames);
    const key = crypto.createHash("sha1").update(body).digest("hex");
    const rel = path.relative(root, file);
    if (clusters.has(key)) clusters.get(key).push(rel);
    else clusters.set(key, [rel]);
  }

  return [...clusters.values()].sort(
    (a, b) => b.length - a.length || a[0].localeCompare(b[0]),
  );
}

export function summarise(root = ROOT) {
  const clusters = clusterPages(root);
  const total = clusters.reduce((n, c) => n + c.length, 0);
  const distinct = clusters.length;
  const duplicates = total - distinct;
  const largest = clusters.length ? clusters[0].length : 0;

  return {
    total,
    distinct,
    duplicates,
    largest,
    // Share of pages that are the only one saying what they say.
    uniqueShare: total ? distinct / total : 1,
    clusters,
  };
}

// ------------------------------------------------------------------- runner

function formatReport(s) {
  const pct = (s.uniqueShare * 100).toFixed(1);
  const lines = [
    `Suburb pages          : ${s.total}`,
    `Distinct page bodies  : ${s.distinct}  (${pct}% of pages are one of a kind)`,
    `Near-duplicate pages  : ${s.duplicates}`,
    "",
    `At most ~${s.distinct} of these ${s.total} pages can be indexed at once.`,
    `Compare that with "indexed pages" in the Page indexing report: if the two`,
    `are close, duplication is the constraint, not crawling or configuration.`,
  ];

  const worst = s.clusters.filter((c) => c.length > 1).slice(0, 10);
  if (worst.length) {
    lines.push("", "Largest duplicate groups (same body, different suburb):");
    for (const c of worst) {
      const names = c
        .slice(0, 3)
        .map((f) => path.basename(f, ".html").replace(/^roofing-/, ""))
        .join(", ");
      const more = c.length > 3 ? `, +${c.length - 3} more` : "";
      lines.push(`  ${String(c.length).padStart(3)} pages  — ${names}${more}`);
    }
  }

  return lines.join("\n");
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === __filename) {
  const s = summarise();

  if (process.argv.includes("--json")) {
    const { clusters, ...rest } = s;
    console.log(
      JSON.stringify({ ...rest, clusters: clusters.filter((c) => c.length > 1) }, null, 2),
    );
  } else {
    console.log(formatReport(s));
  }

  const cap = process.argv
    .find((a) => a.startsWith("--max-cluster="))
    ?.split("=")[1];
  if (cap && s.largest > Number(cap)) {
    console.error(
      `\nLargest duplicate group is ${s.largest} pages, over the --max-cluster=${cap} ceiling.`,
    );
    process.exitCode = 1;
  }
}
