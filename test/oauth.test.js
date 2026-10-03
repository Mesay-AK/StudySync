// Google sign-in: the account-linking rules in config/passportConfig.js,
// exercised directly (no real Google round trip), plus the HTTP redirects.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { api, connectDb, createUser, teardownClients, uniq } from "./helpers/client.js";

let verify;
beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID ||= "test";
  process.env.GOOGLE_CLIENT_SECRET ||= "test";
  process.env.GOOGLE_CALLBACK_URL ||= "http://localhost/cb";
  await connectDb(); // the models share this mongoose connection
  const passport = (await import("../src/config/passportConfig.js")).default;
  const strategy = passport._strategy("google");
  verify = (profile) =>
    new Promise((resolve, reject) =>
      strategy._verify("access", "refresh", profile, (err, user, info) => (err ? reject(err) : resolve({ user, info })))
    );
});
afterAll(teardownClients);

const googleProfile = (email, overrides = {}) => ({
  id: `g${Math.floor(Math.random() * 1e12)}`,
  _json: { email, name: "Google Person", picture: "https://example.test/p.png", ...overrides },
});

describe("Google sign-in account linking", () => {
  it("creates a new password-less account, normalizing the email", async () => {
    const local = uniq("gnew");
    const { user } = await verify(googleProfile(`${local.toUpperCase()}@Example.TEST`));
    expect(user.email).toBe(`${local}@example.test`);
    expect(user.username).toBe(local);
    expect(user.displayName).toBe("Google Person");
    const db = await connectDb();
    expect((await db.collection("users").findOne({ _id: user._id })).password).toBeUndefined();
  });

  it("logs straight into an existing Google-only account (no duplicate), whatever the email case", async () => {
    const local = uniq("gagain");
    const first = await verify(googleProfile(`${local}@example.test`));
    const second = await verify(googleProfile(`${local.toUpperCase()}@EXAMPLE.test`));
    expect(String(second.user._id)).toBe(String(first.user._id));
    const db = await connectDb();
    expect(await db.collection("users").countDocuments({ email: `${local}@example.test` })).toBe(1);
  });

  it("refuses to take over an account created with a password (reason: account_exists)", async () => {
    const existing = await createUser();
    const { user, info } = await verify(googleProfile(existing.email));
    expect(user).toBe(false);
    expect(info).toEqual({ reason: "account_exists" });
  });

  it("refuses a Google profile without an email (reason: no_email)", async () => {
    const { user, info } = await verify(googleProfile(undefined));
    expect(user).toBe(false);
    expect(info).toEqual({ reason: "no_email" });
  });

  it("gives a unique username when the email's local part is already taken", async () => {
    const taken = await createUser();
    const profile = googleProfile(`${taken.username}@another-domain.test`);
    const { user } = await verify(profile);
    expect(user.username).toBe(`${taken.username}-${profile.id.slice(-6)}`);
  });
});

describe("Google sign-in HTTP flow", () => {
  it("/auth/google redirects to Google with this app's client id", async () => {
    const res = await api("/auth/google", {}).catch(() => null);
    // fetch follows redirects by default; check the raw redirect instead.
    void res;
    const raw = await fetch(`${(await import("./helpers/client.js")).baseUrl()}/api/auth/google`, { redirect: "manual" });
    expect(raw.status).toBe(302);
    const location = raw.headers.get("location");
    expect(location).toMatch(/^https:\/\/accounts\.google\.com\//);
    expect(location).toContain("client_id=test");
  });

  it("a cancelled/failed Google callback sends the user back to the login page with an error", async () => {
    const { baseUrl } = await import("./helpers/client.js");
    const raw = await fetch(`${baseUrl()}/api/auth/google/callback?error=access_denied`, { redirect: "manual" });
    expect(raw.status).toBe(302);
    expect(raw.headers.get("location")).toMatch(/^http:\/\/localhost:5173\/login\?error=/);
  });
});
