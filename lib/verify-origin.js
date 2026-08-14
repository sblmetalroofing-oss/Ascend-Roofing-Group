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

/**
 * @param {object} req - the incoming request
 * @param {object} [opts]
 * @param {boolean} [opts.allowSameSiteFetch] - trust a browser-set
 *   `Sec-Fetch-Site: same-origin` header when neither Origin nor Referer is
 *   present. Same-origin GETs send no Origin header at all, so they depend on
 *   Referer, which privacy settings and extensions routinely strip. Page
 *   scripts cannot forge Sec-Fetch-Site (it is a forbidden header name), so
 *   this recovers those visitors without opening a cross-site hole. Read-only
 *   endpoints only — never for anything that changes state.
 */
export function verifyOrigin(req, opts = {}) {
  const allowed = parseAllowList();
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  const candidate = origin || (referer && hostFromUrl(referer));
  if (candidate) return allowed.includes(candidate.replace(/\/$/, ""));

  return Boolean(
    opts.allowSameSiteFetch && req.headers["sec-fetch-site"] === "same-origin",
  );
}
