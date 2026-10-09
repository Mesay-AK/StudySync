// src/config/env.js: parsing, defaults and validation, as a pure function.
import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config/env.js";

const VALID = {
  MONGO_URI: "mongodb://localhost:27017/x",
  JWT_SECRET: "a-real-secret",
  JWT_REFRESH_SECRET: "another-real-secret",
};
const load = (extra = {}) => loadConfig({ ...VALID, ...extra });

describe("required settings", () => {
  it("a minimal development config is valid, with sensible defaults", () => {
    const { errors, config } = load();
    expect(errors).toEqual([]);
    expect(config).toMatchObject({
      nodeEnv: "development",
      isProduction: false,
      port: 3002,
      cookies: { sameSite: "strict", secure: false },
      network: { allowLocalhost: true, trustProxy: false, frameAncestors: [] },
      rateLimits: { auth: { max: 20, windowMs: 15 * 60_000 }, upload: { max: 30 }, contact: { max: 10 } },
      uploads: { maxAttachmentBytes: 20 * 1024 * 1024, maxMaterialBytes: 25 * 1024 * 1024 },
      redis: { host: "127.0.0.1", port: 6379, tls: false },
      google: { enabled: false },
    });
  });

  it("reports EVERY problem at once, not just the first", () => {
    const { errors } = loadConfig({
      NODE_ENV: "production",
      JWT_SECRET: "change-me",
      COOKIE_SAMESITE: "sideways",
      RATE_LIMIT_AUTH_MAX: "lots",
      GOOGLE_CLIENT_ID: "only-this-one",
    });
    const text = errors.join("\n");
    for (const expected of ["MONGO_URI is missing", "JWT_SECRET is still the example value", "JWT_REFRESH_SECRET is missing", "BASE_URL is missing", "FRONTEND_URL is missing", "COOKIE_SAMESITE must be", "RATE_LIMIT_AUTH_MAX must be a whole number", "Google sign-in is half-configured"]) {
      expect(text, expected).toContain(expected);
    }
  });

  it("when MONGO_URI is missing, names lookalike keys (typos, stray spaces) without their values", () => {
    const { errors } = loadConfig({ ...VALID, MONGO_URI: undefined, "MONGO_URI ": "mongodb://secret@h", MONGODB_URL: "x", mongo_uri: "y" });
    const text = errors.join();
    expect(text).toContain('"MONGO_URI "');
    expect(text).toContain('"MONGODB_URL"');
    expect(text).toContain('"mongo_uri"');
    expect(text).not.toContain("secret");
    expect(loadConfig({ ...VALID, MONGO_URI: undefined }).errors.join()).not.toContain("Similar keys");
  });

  it("rejects a MONGO_URI that isn't a MongoDB URL (e.g. a truncated paste)", () => {
    expect(load({ MONGO_URI: "ongodb+srv://user:pw@cluster.example.net" }).errors.join()).toMatch(/must start with "mongodb/);
    expect(load({ MONGO_URI: "mongodb+srv://user:pw@cluster.example.net" }).errors).toEqual([]);
  });

  it("production requires the public URLs and defaults to cross-site cookies", () => {
    const { errors, config } = load({ NODE_ENV: "production", BASE_URL: "https://api.x.test/", FRONTEND_URL: "https://x.test" });
    expect(errors).toEqual([]);
    expect(config.baseUrl).toBe("https://api.x.test"); // trailing slash removed
    expect(config.cookies).toMatchObject({ sameSite: "none", secure: true });
    expect(config.network.allowLocalhost).toBe(false);
  });

  it("SameSite=None without Secure is refused (browsers drop such cookies)", () => {
    expect(load({ COOKIE_SAMESITE: "none", COOKIE_SECURE: "false" }).errors.join()).toMatch(/requires COOKIE_SECURE=true/);
  });
});

describe("allowed origins", () => {
  const allowed = (origins, origin, extra = {}) =>
    load({ NODE_ENV: "production", BASE_URL: "https://api.x.test", FRONTEND_URL: "https://app.x.test", CORS_ORIGINS: origins, ...extra }).config.network.isAllowedOrigin(origin);

  it("allows FRONTEND_URL and every exact origin in CORS_ORIGINS", () => {
    expect(allowed("", "https://app.x.test")).toBe(true);
    expect(allowed("https://admin.x.test, https://other.test/", "https://admin.x.test")).toBe(true);
    expect(allowed("https://admin.x.test, https://other.test/", "https://other.test")).toBe(true);
    expect(allowed("https://admin.x.test", "https://evil.test")).toBe(false);
  });

  it("supports wildcard subdomains without matching lookalikes", () => {
    const o = "https://*.example.com";
    expect(allowed(o, "https://a.example.com")).toBe(true);
    expect(allowed(o, "https://a.b.example.com")).toBe(true);
    expect(allowed(o, "https://example.com")).toBe(false);
    expect(allowed(o, "https://evilexample.com")).toBe(false);
    expect(allowed(o, "https://a.example.com.evil.test")).toBe(false);
    expect(allowed(o, "http://a.example.com")).toBe(false); // scheme must match
  });

  it("localhost origins only when allowed (default: outside production)", () => {
    expect(load().config.network.isAllowedOrigin("http://localhost:5174")).toBe(true);
    expect(allowed("", "http://localhost:5173")).toBe(false);
    expect(allowed("", "http://localhost:5173", { CORS_ALLOW_LOCALHOST: "true" })).toBe(true);
    expect(load({ CORS_ALLOW_LOCALHOST: "off" }).config.network.isAllowedOrigin("http://localhost:5173")).toBe(false);
  });
});

describe("other settings", () => {
  it.each([
    ["", false], ["1", 1], ["2", 2], ["true", true], ["false", false],
    ["10.0.0.0/8, 192.168.1.1", ["10.0.0.0/8", "192.168.1.1"]], ["loopback", ["loopback"]],
  ])("TRUST_PROXY=%j -> %j", (value, expected) => {
    expect(load({ TRUST_PROXY: value }).config.network.trustProxy).toEqual(expected);
  });

  it("rejects a malformed TRUST_PROXY", () => {
    expect(load({ TRUST_PROXY: "<script>" }).errors.join()).toMatch(/TRUST_PROXY/);
  });

  it("reads rate limits and upload sizes", () => {
    const { config } = load({ RATE_LIMIT_AUTH_MAX: "5", RATE_LIMIT_AUTH_WINDOW_MINUTES: "1", UPLOAD_MAX_ATTACHMENT_MB: "2" });
    expect(config.rateLimits.auth).toEqual({ max: 5, windowMs: 60_000 });
    expect(config.uploads.maxAttachmentBytes).toBe(2 * 1024 * 1024);
  });

  it.each(["0", "-1", "1.5", "abc"])("refuses a non-positive or non-integer limit (%s)", (v) => {
    expect(load({ RATE_LIMIT_UPLOAD_MAX: v }).errors.join()).toMatch(/RATE_LIMIT_UPLOAD_MAX/);
  });

  it.each([["yes", true], ["ON", true], ["0", false], ["No", false]])("booleans accept %s", (v, expected) => {
    expect(load({ CORS_ALLOW_LOCALHOST: v }).config.network.allowLocalhost).toBe(expected);
  });

  it("REDIS_URL takes priority; rediss:// turns on TLS", () => {
    expect(load({ REDIS_URL: "rediss://default:pw@host:6380" }).config.redis).toMatchObject({ url: "rediss://default:pw@host:6380", tls: true });
    expect(load({ REDIS_URL: "http://nope" }).errors.join()).toMatch(/REDIS_URL/);
  });

  it("Google sign-in is on only when all three settings are present", () => {
    expect(load({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b", GOOGLE_CALLBACK_URL: "https://x/cb" }).config.google.enabled).toBe(true);
    expect(load().config.google.enabled).toBe(false);
  });

  it("splits comma lists and ignores blanks", () => {
    expect(load({ UPLOADS_FRAME_ANCESTORS: " https://a.test , ,https://b.test" }).config.network.frameAncestors).toEqual(["https://a.test", "https://b.test"]);
  });
});
