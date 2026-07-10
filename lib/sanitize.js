// Shared input sanitisation for the form/quote endpoints.
// Escapes the five HTML-special characters so user input is safe to
// interpolate into email HTML. Sanitise at the point of use, not just
// at storage time.

export function sanitize(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function isValidEmail(str) {
  if (typeof str !== "string") return false;
  // Deliberately loose: one @, no whitespace, a dot in the domain.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str.trim());
}

const ALLOWED_UPLOAD_TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * Server-side validation for base64 file uploads ({ name, type, data }).
 * The client enforces size/type limits too, but only this check is
 * trustworthy. Returns { ok, error } or { ok, contentType, content,
 * filename } with a regenerated safe filename (client-supplied names are
 * never used for attachments).
 */
export function validateUpload(file, { label = "file", maxBytes = 5 * 1024 * 1024 } = {}) {
  if (!file || typeof file.data !== "string") {
    return { ok: false, error: `${label}: missing file data.` };
  }
  const contentType = String(file.type || "").toLowerCase().split(";")[0].trim();
  const ext = ALLOWED_UPLOAD_TYPES[contentType];
  if (!ext) {
    return { ok: false, error: `${label}: only PDF, JPG, or PNG files are accepted.` };
  }
  const base64 = file.data.includes(",") ? file.data.split(",")[1] : file.data;
  if (!base64 || !/^[A-Za-z0-9+/=\s]+$/.test(base64)) {
    return { ok: false, error: `${label}: invalid file encoding.` };
  }
  // Decoded size ≈ 3/4 of the base64 length; padding makes this an upper bound.
  const decodedBytes = Math.floor((base64.replace(/\s/g, "").length * 3) / 4);
  if (decodedBytes > maxBytes) {
    return {
      ok: false,
      error: `${label}: file is too large (max ${Math.round(maxBytes / (1024 * 1024))} MB).`,
    };
  }
  const safeBase = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "upload";
  return {
    ok: true,
    contentType,
    content: base64,
    filename: `${safeBase}.${ext}`,
  };
}
