// Settings driven by the environment / .env, verified against real servers.
import { describe, it, expect, afterAll, inject } from "vitest";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { io as ioClient } from "socket.io-client";
import { baseUrl, clearRateLimits, createUser, teardownClients, STRONG_PASSWORD, uniq } from "./helpers/client.js";
import { startExtraServer } from "./helpers/extraServer.js";

const servers = [];
const serverWith = async (overrides) => {
  const s = await startExtraServer(overrides);
  servers.push(s);
  return s;
};
afterAll(async () => {
  await Promise.all(servers.map((s) => s.stop()));
  await teardownClients();
});

const post = (base, p, body, headers = {}) =>
  fetch(`${base}/api${p}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("startup check", () => {
  it("refuses to start and lists every missing/invalid setting at once", () => {
    const entry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", process.env.TEST_SERVER_ENTRY || "src/index.js");
    const res = spawnSync(process.execPath, [entry], {
      cwd: fs.mkdtempSync(path.join(os.tmpdir(), "studysync-cfg-")), // no .env here
      env: { PATH: process.env.PATH, NODE_ENV: "production", JWT_SECRET: "change-me", COOKIE_SAMESITE: "sideways", GOOGLE_CLIENT_ID: "x" },
      encoding: "utf8",
      timeout: 20_000,
    });
    expect(res.status).toBe(1);
    const out = res.stdout + res.stderr;
    for (const expected of ["Refusing to start", "MONGO_URI is missing", "JWT_SECRET is still the example value", "JWT_REFRESH_SECRET is missing", "BASE_URL is missing", "FRONTEND_URL is missing", "COOKIE_SAMESITE must be", "half-configured"]) {
      expect(out, expected).toContain(expected);
    }
  });
});

describe("TRUST_PROXY and per-client rate limits", () => {
  it("behind a proxy, each client IP gets its own limit (instead of the whole site sharing one)", async () => {
    const s = await serverWith({ TRUST_PROXY: "1", RATE_LIMIT_AUTH_MAX: "3" });
    await clearRateLimits();
    const attempt = (ip) => post(s.baseUrl, "/auth/login", { email: "x@y.z", password: "x" }, { "X-Forwarded-For": ip }).then((r) => r.status);

    const alice = [];
    for (let i = 0; i < 4; i++) alice.push(await attempt("203.0.113.1"));
    expect(alice).toEqual([401, 401, 401, 429]);
    // A different client behind the same proxy is unaffected.
    expect(await attempt("203.0.113.2")).toBe(401);
    await clearRateLimits();
  });

  it("without TRUST_PROXY, a spoofed X-Forwarded-For can't dodge the limit", async () => {
    await clearRateLimits();
    const statuses = [];
    for (let i = 0; i < 21; i++) {
      statuses.push((await post(baseUrl(), "/auth/login", { email: "x@y.z", password: "x" }, { "X-Forwarded-For": `198.51.100.${i}` })).status);
    }
    expect(statuses[20]).toBe(429);
    await clearRateLimits();
  });
});

describe("CORS_ORIGINS", () => {
  const corsFrom = async (base, origin) =>
    (await fetch(`${base}/api/config`, { headers: { Origin: origin } })).headers.get("access-control-allow-origin");

  it("allows FRONTEND_URL, listed origins and wildcard subdomains; refuses everything else (production)", async () => {
    const s = await serverWith({
      NODE_ENV: "production",
      FRONTEND_URL: "https://app.example.test",
      CORS_ORIGINS: "https://admin.example.test, https://*.preview.example.test",
    });
    expect(await corsFrom(s.baseUrl, "https://app.example.test")).toBe("https://app.example.test");
    expect(await corsFrom(s.baseUrl, "https://admin.example.test")).toBe("https://admin.example.test");
    expect(await corsFrom(s.baseUrl, "https://pr-12.preview.example.test")).toBe("https://pr-12.preview.example.test");
    for (const refused of ["https://evil.test", "https://preview.example.test.evil.test", "http://localhost:5173"]) {
      expect(await corsFrom(s.baseUrl, refused), refused).toBeNull();
    }

    // The live (Socket.IO) connection follows the same list.
    const handshake = (origin) => new Promise((resolve) => {
      const sock = ioClient(s.baseUrl, { transports: ["polling"], extraHeaders: { Origin: origin }, reconnection: false, forceNew: true });
      sock.once("connect_error", (err) => { sock.close(); resolve(err.message); });
      sock.once("connect", () => { sock.close(); resolve("connected"); });
    });
    // Allowed origin: reaches the auth check (no token) rather than a CORS refusal.
    expect(await handshake("https://app.example.test")).toMatch(/Authentication required/);
    // Disallowed origin: refused before authentication even runs (browsers
    // skip CORS for WebSockets, so the server itself has to say no).
    expect(await handshake("https://evil.test")).not.toMatch(/Authentication required/);
    expect(await handshake("https://evil.test")).not.toBe("connected");
  });

  it("CORS_ALLOW_LOCALHOST turns localhost dev servers on in production too", async () => {
    const s = await serverWith({ NODE_ENV: "production", CORS_ALLOW_LOCALHOST: "true" });
    expect(await corsFrom(s.baseUrl, "http://localhost:5174")).toBe("http://localhost:5174");
  });
});

describe("cookies", () => {
  const setCookies = (res) => res.headers.getSetCookie().filter((c) => /^(accessToken|refreshToken)=/.test(c));

  it("default production cookies are SameSite=None; Secure (cross-site frontend)", async () => {
    const s = await serverWith({ NODE_ENV: "production", COOKIE_SAMESITE: undefined, COOKIE_SECURE: undefined });
    const u = await createUser();
    const login = await post(s.baseUrl, "/auth/login", { email: u.email, password: u.password });
    for (const c of setCookies(login)) {
      expect(c).toMatch(/SameSite=None/i);
      expect(c).toMatch(/Secure/);
      expect(c).toMatch(/HttpOnly/);
    }
  });

  it("COOKIE_SAMESITE / COOKIE_DOMAIN apply on login AND logout (so logout really clears them)", async () => {
    const s = await serverWith({ COOKIE_SAMESITE: "lax", COOKIE_SECURE: "true", COOKIE_DOMAIN: ".example.test" });
    const u = await createUser();
    const login = await post(s.baseUrl, "/auth/login", { email: u.email, password: u.password });
    const cookies = setCookies(login);
    expect(cookies).toHaveLength(2);
    for (const c of cookies) expect(c).toMatch(/Domain=\.?example\.test.*|.*Domain=\.?example\.test/i);
    for (const c of cookies) expect(c).toMatch(/SameSite=Lax/i);

    const logout = await post(s.baseUrl, "/auth/logout", {});
    const cleared = setCookies(logout);
    expect(cleared).toHaveLength(2);
    for (const c of cleared) {
      expect(c).toMatch(/Domain=\.?example\.test/i);
      expect(c).toMatch(/Expires=Thu, 01 Jan 1970/);
    }
  });
});

describe("upload size limits", () => {
  it("UPLOAD_MAX_ATTACHMENT_MB is enforced and published to the frontend", async () => {
    const s = await serverWith({ UPLOAD_MAX_ATTACHMENT_MB: "1" });
    const cfg = await (await fetch(`${s.baseUrl}/api/config`)).json();
    expect(cfg.uploads.maxAttachmentBytes).toBe(1024 * 1024);

    const u = await createUser();
    const form = new FormData();
    form.append("media", new Blob([Buffer.alloc(1.5 * 1024 * 1024)], { type: "text/plain" }), "big.txt");
    const res = await fetch(`${s.baseUrl}/api/messages/upload`, { method: "POST", headers: { Authorization: `Bearer ${u.token}` }, body: form });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/too large/);
  });
});

describe("optional Google sign-in", () => {
  it("without the GOOGLE_* settings the server starts, reports it off, and its routes send people back to login", async () => {
    const s = await serverWith({ GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined, GOOGLE_CALLBACK_URL: undefined });
    expect((await (await fetch(`${s.baseUrl}/api/config`)).json()).auth.google).toBe(false);
    for (const route of ["/api/auth/google", "/api/auth/google/callback?code=x"]) {
      const res = await fetch(`${s.baseUrl}${route}`, { redirect: "manual" });
      expect(res.status, route).toBe(302);
      expect(res.headers.get("location")).toBe("http://localhost:5173/login?error=google_disabled");
    }
    // Everything else still works.
    await clearRateLimits();
    const username = uniq("nog");
    expect((await post(s.baseUrl, "/auth/register", { username, email: `${username}@x.test`, password: STRONG_PASSWORD })).status).toBe(201);
  });

  it("with them, it's reported on", async () => {
    expect((await (await fetch(`${baseUrl()}/api/config`)).json())).toEqual({
      auth: { google: true },
      uploads: { maxAttachmentBytes: 20 * 1024 * 1024, maxMaterialBytes: 25 * 1024 * 1024 },
    });
  });
});

describe("who may embed uploads (frame-ancestors)", () => {
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  const frameAncestorsOf = async (base) => {
    const u = await createUser();
    const form = new FormData();
    form.append("media", new Blob([PNG], { type: "image/png" }), "a.png");
    const { url } = await (await fetch(`${base}/api/messages/upload`, { method: "POST", headers: { Authorization: `Bearer ${u.token}` }, body: form })).json();
    const file = await fetch(url.replace(inject("baseUrl"), base), { headers: { Authorization: `Bearer ${u.token}` } });
    expect(file.status).toBe(200);
    return file.headers.get("content-security-policy");
  };

  it("defaults to the allowed frontend origins (not '*')", async () => {
    const csp = await frameAncestorsOf(baseUrl());
    expect(csp).toBe("frame-ancestors http://localhost:5173 http://localhost:* http://127.0.0.1:*");
  });

  it("UPLOADS_FRAME_ANCESTORS overrides it", async () => {
    const s = await serverWith({ UPLOADS_FRAME_ANCESTORS: "https://a.test, https://b.test" });
    expect(await frameAncestorsOf(s.baseUrl)).toBe("frame-ancestors https://a.test https://b.test");
  });
});

describe("REDIS_URL", () => {
  it("connects with a single URL instead of host/port", async () => {
    const s = await serverWith({ REDIS_HOST: undefined, REDIS_PORT: undefined, REDIS_PASSWORD: undefined, REDIS_URL: `redis://${inject("redisHost")}:${inject("redisPort")}` });
    expect(await (await fetch(`${s.baseUrl}/health`)).json()).toMatchObject({ redis: "up" });
  });
});
