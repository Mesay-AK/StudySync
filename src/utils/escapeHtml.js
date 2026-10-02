// For interpolating user-controlled text (room names, contact-form fields)
// into HTML email bodies - unescaped, a room named `<a href="...">Verify your
// account</a>` becomes a working phishing link sent from our own domain.
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
