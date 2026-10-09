// Every runtime setting the server reads, in one place.
//
// Values come from the environment - on a host like Render, its Environment
// tab; locally, the .env file in the folder you start the server from (loaded
// here first, so import order elsewhere doesn't matter). See .env.example for
// the full, documented list.
//
// `loadConfig(env)` is a pure function of an env object so it can be tested
// directly; `config` is the result for this process, and `configErrors` lists
// everything missing or invalid (index.js refuses to start if it's non-empty,
// printing them ALL at once instead of failing on the first).
// Not under the test runner: tests start servers with explicit settings and
// must never pick up a developer's real .env (database passwords included).
if (!process.env.VITEST) await import("dotenv/config");

const PLACEHOLDER_SECRET = "change-me";

const str = (v) => (typeof v === "string" ? v.trim() : "");

const list = (v) =>
  str(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const toInt = (v, fallback, { min = 0, name, errors }) => {
  if (str(v) === "") return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min) {
    errors.push(`${name} must be a whole number${min ? ` >= ${min}` : ""} (got "${v}").`);
    return fallback;
  }
  return n;
};

const toBool = (v, fallback, { name, errors }) => {
  const s = str(v).toLowerCase();
  if (s === "") return fallback;
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  errors.push(`${name} must be true or false (got "${v}").`);
  return fallback;
};

const stripSlash = (url) => url.replace(/\/+$/, "");

// Exact origins ("https://app.example.com") or wildcard subdomains
// ("https://*.example.com" - matches any single or nested subdomain, but not
// example.com itself or other domains that merely end the same way).
export const compileOriginMatchers = (origins) =>
  origins.map((pattern) => {
    const clean = stripSlash(pattern);
    if (!clean.includes("*")) return (origin) => origin === clean;
    const escaped = clean.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\\?\*/g, "([a-z0-9-]+\\.)*[a-z0-9-]+");
    const rx = new RegExp(`^${escaped}$`, "i");
    return (origin) => rx.test(origin);
  });

const isLocalhostOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(origin);

// "1" -> 1 hop; "true"/"false"; a comma list of IPs/subnets; or "loopback" etc.
const parseTrustProxy = (v, { errors }) => {
  const s = str(v);
  if (s === "") return false;
  if (/^\d+$/.test(s)) return Number(s);
  const lower = s.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  if (!/^[\w.:/,\s-]+$/.test(s)) {
    errors.push(`TRUST_PROXY must be a hop count, true/false, or a list of proxy IPs/subnets (got "${v}").`);
    return false;
  }
  return list(s);
};

// When a required key is missing, name (never print the values of) keys that
// look like a typo of it - "MONGO_URI " with a trailing space, "mongo_uri",
// "MONGODB_URI" - since a host's dashboard makes those easy to miss.
const lookalikes = (env, wanted) => {
  const squash = (k) => k.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const target = squash(wanted);
  const stem = wanted.split("_")[0];
  const found = Object.keys(env).filter(
    (k) => k !== wanted && (squash(k) === target || k.toUpperCase().includes(stem)),
  );
  return found.length ? ` Similar keys that ARE set: ${found.map((k) => JSON.stringify(k)).join(", ")} - check the exact spelling.` : "";
};

export const loadConfig = (env) => {
  const errors = [];
  const nodeEnv = str(env.NODE_ENV) || "development";
  const isProduction = nodeEnv === "production";

  // --- required ---------------------------------------------------------
  const mongoUri = str(env.MONGO_URI);
  if (!mongoUri) errors.push(`MONGO_URI is missing - set it to your MongoDB connection string.${lookalikes(env, "MONGO_URI")}`);
  else if (!/^mongodb(\+srv)?:\/\//.test(mongoUri)) errors.push('MONGO_URI must start with "mongodb://" or "mongodb+srv://".');

  for (const key of ["JWT_SECRET", "JWT_REFRESH_SECRET"]) {
    const value = str(env[key]);
    if (!value) errors.push(`${key} is missing - set it to a long random string.`);
    else if (value === PLACEHOLDER_SECRET) errors.push(`${key} is still the example value "${PLACEHOLDER_SECRET}" - set a real secret.`);
  }

  const baseUrl = stripSlash(str(env.BASE_URL));
  const frontendUrl = stripSlash(str(env.FRONTEND_URL));
  if (isProduction && !baseUrl) errors.push("BASE_URL is missing - set it to this API's public URL (e.g. https://api.example.com).");
  if (isProduction && !frontendUrl) errors.push("FRONTEND_URL is missing - set it to the website's URL (e.g. https://app.example.com).");

  // --- network access ---------------------------------------------------
  const corsOrigins = [...new Set([frontendUrl, ...list(env.CORS_ORIGINS).map(stripSlash)].filter(Boolean))];
  const allowLocalhost = toBool(env.CORS_ALLOW_LOCALHOST, !isProduction, { name: "CORS_ALLOW_LOCALHOST", errors });
  const originMatchers = compileOriginMatchers(corsOrigins);
  const isAllowedOrigin = (origin) =>
    (allowLocalhost && isLocalhostOrigin(origin)) || originMatchers.some((match) => match(origin));

  // Pages allowed to show uploads in an <iframe> (attachment previews):
  // defaults to the allowed origins rather than "*" (everyone).
  const frameAncestors = list(env.UPLOADS_FRAME_ANCESTORS);

  const trustProxy = parseTrustProxy(env.TRUST_PROXY, { errors });

  // --- cookies ----------------------------------------------------------
  // Separate sites (two *.onrender.com hosts) need SameSite=None + Secure;
  // subdomains of one domain (app./api.example.com) can use "lax".
  const sameSite = (str(env.COOKIE_SAMESITE) || (isProduction ? "none" : "strict")).toLowerCase();
  if (!["strict", "lax", "none"].includes(sameSite)) errors.push(`COOKIE_SAMESITE must be strict, lax or none (got "${env.COOKIE_SAMESITE}").`);
  const cookieSecure = toBool(env.COOKIE_SECURE, isProduction, { name: "COOKIE_SECURE", errors });
  if (sameSite === "none" && !cookieSecure) errors.push("COOKIE_SAMESITE=none requires COOKIE_SECURE=true (browsers reject it otherwise).");

  // --- limits -----------------------------------------------------------
  const rateLimit = (prefix, max, windowMinutes) => ({
    max: toInt(env[`RATE_LIMIT_${prefix}_MAX`], max, { min: 1, name: `RATE_LIMIT_${prefix}_MAX`, errors }),
    windowMs: toInt(env[`RATE_LIMIT_${prefix}_WINDOW_MINUTES`], windowMinutes, { min: 1, name: `RATE_LIMIT_${prefix}_WINDOW_MINUTES`, errors }) * 60_000,
  });

  const mb = (key, fallback) => toInt(env[key], fallback, { min: 1, name: key, errors }) * 1024 * 1024;

  // --- redis ------------------------------------------------------------
  const redisUrl = str(env.REDIS_URL);
  if (redisUrl && !/^rediss?:\/\//.test(redisUrl)) errors.push('REDIS_URL must start with "redis://" or "rediss://" (TLS).');

  // --- google sign-in (optional) ----------------------------------------
  const google = {
    clientId: str(env.GOOGLE_CLIENT_ID),
    clientSecret: str(env.GOOGLE_CLIENT_SECRET),
    callbackUrl: str(env.GOOGLE_CALLBACK_URL),
  };
  const googleSet = [google.clientId, google.clientSecret, google.callbackUrl].filter(Boolean).length;
  google.enabled = googleSet === 3;
  if (googleSet > 0 && googleSet < 3) {
    errors.push("Google sign-in is half-configured: set all of GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_CALLBACK_URL, or none of them to turn it off.");
  }

  return {
    errors,
    config: {
      nodeEnv,
      isProduction,
      port: toInt(env.PORT, 3002, { min: 1, name: "PORT", errors }),
      baseUrl,
      frontendUrl,
      mongoUri,
      network: { corsOrigins, allowLocalhost, isAllowedOrigin, frameAncestors, trustProxy },
      cookies: { sameSite, secure: cookieSecure, domain: str(env.COOKIE_DOMAIN) || undefined },
      rateLimits: {
        auth: rateLimit("AUTH", 20, 15),
        upload: rateLimit("UPLOAD", 30, 15),
        contact: rateLimit("CONTACT", 10, 15),
      },
      uploads: {
        maxAttachmentBytes: mb("UPLOAD_MAX_ATTACHMENT_MB", 20),
        maxMaterialBytes: mb("UPLOAD_MAX_MATERIAL_MB", 25),
      },
      redis: {
        url: redisUrl || undefined,
        host: str(env.REDIS_HOST) || "127.0.0.1",
        port: toInt(env.REDIS_PORT, 6379, { min: 1, name: "REDIS_PORT", errors }),
        password: str(env.REDIS_PASSWORD) || undefined,
        tls: toBool(env.REDIS_TLS, redisUrl.startsWith("rediss://"), { name: "REDIS_TLS", errors }),
      },
      google,
    },
  };
};

const loaded = loadConfig(process.env);
export const config = loaded.config;
export const configErrors = loaded.errors;

// Options for ioredis: a URL (Render/Upstash style) or host/port/password.
export const redisOptions = (extra = {}) => {
  const { url, host, port, password, tls } = config.redis;
  const tlsOption = tls ? { tls: {} } : {};
  return url ? [url, { ...tlsOption, ...extra }] : [{ host, port, password, ...tlsOption, ...extra }];
};
