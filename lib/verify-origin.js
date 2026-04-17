// Cross-site request forgery mitigation.
// Verifies the Origin (or Referer as fallback) against an allow-list
// derived from the ALLOWED_ORIGINS env var. In non-production without
// an explicit allow-list we permit same-host submissions so local
// development keeps working.

const DEFAULT_ALLOWED = [
  "https://ascendroofinggroup.com.au",
  "https://www.ascendroofinggroup.com.au",
];

function parseAllowList() {
  const raw = process.env.ALLOWED_ORIGINS;
  if (!raw) return DEFAULT_ALLOWED;
  return raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

function hostFromUrl(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function verifyOrigin(req) {
  const allowed = parseAllowList();
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  const candidate = origin || (referer && hostFromUrl(referer));
  if (!candidate) return false;

  return allowed.includes(candidate.replace(/\/$/, ""));
}
