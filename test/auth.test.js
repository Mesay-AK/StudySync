import { describe, it, expect, afterAll, beforeEach } from "vitest";
import {
  api,
  createUser,
  clearRateLimits,
  connectDb,
  cookiesFrom,
  cookieValue,
  getRedis,
  teardownClients,
  uniq,
  STRONG_PASSWORD,
  sleep,
} from "./helpers/client.js";

afterAll(teardownClients);
beforeEach(clearRateLimits);

describe("registration", () => {
  it("registers a user, stores a hashed password, and never returns it", async () => {
    const username = uniq("reg");
    const email = `${username}@example.test`;
    const res = await api("/auth/register", { method: "POST", body: { username, email, password: STRONG_PASSWORD } });
    expect(res.status).toBe(201);

    const db = await connectDb();
    const stored = await db.collection("users").findOne({ email });
    expect(stored.password).toBeTruthy();
    expect(stored.password).not.toBe(STRONG_PASSWORD);
    expect(stored.displayName).toBe(username); // defaults to username
    expect(stored.isAdmin).toBe(false);
  });

  it("rejects a duplicate email and a duplicate username", async () => {
    const u = await createUser();
    const dupEmail = await api("/auth/register", {
      method: "POST",
      body: { username: uniq("x"), email: u.email, password: STRONG_PASSWORD },
    });
    expect(dupEmail.status).toBe(400);
    expect(dupEmail.body.message).toMatch(/Email/);

    const dupName = await api("/auth/register", {
      method: "POST",
      body: { username: u.username, email: `${uniq("x")}@example.test`, password: STRONG_PASSWORD },
    });
    expect(dupName.status).toBe(400);
    expect(dupName.body.message).toMatch(/Username/);
  });

  it("rejects weak passwords", async () => {
    for (const password of ["short1!A", "alllowercase1!", "NoDigits!!", "NoSpecial123", undefined]) {
      if (password === "short1!A") continue; // 8 chars, actually valid
      const res = await api("/auth/register", {
        method: "POST",
        body: { username: uniq("w"), email: `${uniq("w")}@example.test`, password },
      });
      expect(res.status, `password ${password}`).toBe(400);
    }
  });

  it("cannot self-register as a site admin by sending isAdmin", async () => {
    const username = uniq("esc");
    const email = `${username}@example.test`;
    await api("/auth/register", { method: "POST", body: { username, email, password: STRONG_PASSWORD, isAdmin: true } });
    const db = await connectDb();
    expect((await db.collection("users").findOne({ email })).isAdmin).toBe(false);
  });

  it("rejects a request missing the username with a 4xx, never a 5xx", async () => {
    const res = await api("/auth/register", {
      method: "POST",
      body: { email: `${uniq("nou")}@example.test`, password: STRONG_PASSWORD },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

describe("login / session", () => {
  it("logs in, sets httpOnly auth cookies, and /auth/me resolves the user", async () => {
    const u = await createUser();
    const login = await api("/auth/login", { method: "POST", body: { email: u.email, password: u.password } });
    expect(login.status).toBe(200);
    const setCookies = login.headers.getSetCookie();
    expect(setCookies.some((c) => c.startsWith("accessToken=") && /HttpOnly/i.test(c))).toBe(true);
    expect(setCookies.some((c) => c.startsWith("refreshToken=") && /HttpOnly/i.test(c))).toBe(true);

    const me = await api("/auth/me", { cookie: cookiesFrom(login.headers) });
    expect(me.status).toBe(200);
    expect(me.body._id).toBe(u.id);
    expect(me.body.password).toBeUndefined();
  });

  it("returns the same 401 for unknown email and wrong password (no account enumeration)", async () => {
    const u = await createUser();
    const wrongPw = await api("/auth/login", { method: "POST", body: { email: u.email, password: "Wrong!Pass1" } });
    const noUser = await api("/auth/login", { method: "POST", body: { email: `${uniq()}@nope.test`, password: "Wrong!Pass1" } });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body).toEqual(noUser.body);
  });

  it("answers 401 (what the frontend refreshes on) for no token, a garbage token, and a token signed with another secret", async () => {
    expect((await api("/auth/me")).status).toBe(401);
    expect((await api("/auth/me", { token: "garbage" })).status).toBe(401);
    // HS256 token for a plausible payload, signed with the WRONG key.
    // jsonwebtoken needs the same Node-26 SlowBuffer shim the server uses.
    await import("../src/compat/slowBufferShim.js");
    const jwt = (await import("jsonwebtoken")).default;
    const forged = jwt.sign({ userId: "000000000000000000000000" }, "change-me");
    expect((await api("/auth/me", { token: forged })).status).toBe(401);
  });

  it("blocks a banned user from logging in and from using an already-issued token", async () => {
    const u = await createUser();
    const db = await connectDb();
    await db.collection("users").updateOne({ email: u.email }, { $set: { isBanned: true } });

    expect((await api("/auth/me", { token: u.token })).status).toBe(403);
    const login = await api("/auth/login", { method: "POST", body: { email: u.email, password: u.password } });
    expect(login.status).toBe(403);
  });

  it("rate-limits /api/auth after 20 requests per window", async () => {
    await clearRateLimits();
    const statuses = [];
    for (let i = 0; i < 21; i++) {
      statuses.push((await api("/auth/login", { method: "POST", body: { email: "x@y.z", password: "x" } })).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true);
    expect(statuses[20]).toBe(429);
    await clearRateLimits();
  });
});

describe("refresh-token rotation", () => {
  it("refuses to refresh a session for a banned or deleted account", async () => {
    const banned = await createUser();
    const deleted = await createUser();
    const db = await connectDb();
    await db.collection("users").updateOne({ email: banned.email }, { $set: { isBanned: true } });
    await db.collection("users").deleteOne({ email: deleted.email });

    expect((await api("/auth/refresh", { method: "POST", cookie: banned.cookie })).status).toBe(403);
    expect((await api("/auth/refresh", { method: "POST", cookie: deleted.cookie })).status).toBe(403);
  });

  it("rotates the refresh token and issues a working access token", async () => {
    const u = await createUser();
    const res = await api("/auth/refresh", { method: "POST", cookie: u.cookie });
    expect(res.status).toBe(200);
    const newCookie = cookiesFrom(res.headers);
    expect(cookieValue(newCookie, "refreshToken")).not.toBe(cookieValue(u.cookie, "refreshToken"));
    expect((await api("/auth/me", { token: res.body.accessToken })).status).toBe(200);
  });

  it("detects replay of a rotated refresh token and revokes the whole family", async () => {
    const u = await createUser();
    const first = await api("/auth/refresh", { method: "POST", cookie: u.cookie });
    expect(first.status).toBe(200);
    const rotatedCookie = cookiesFrom(first.headers);

    // Attacker replays the original (already rotated) token.
    const replay = await api("/auth/refresh", { method: "POST", cookie: u.cookie });
    expect(replay.status).toBe(403);

    // ...which must also kill the legitimate user's current token.
    const legit = await api("/auth/refresh", { method: "POST", cookie: rotatedCookie });
    expect(legit.status).toBe(403);
  });

  it("logout invalidates the refresh token server-side", async () => {
    const u = await createUser();
    const out = await api("/auth/logout", { method: "POST", cookie: u.cookie });
    expect(out.status).toBe(200);
    const res = await api("/auth/refresh", { method: "POST", cookie: u.cookie });
    expect(res.status).toBe(403);
  });

  it("two concurrent refreshes with the same (valid) token leave the user with a usable session", async () => {
    // Two browser tabs (or a tab + a retry) refreshing at the same moment.
    // The frontend serializes this with navigator.locks where available,
    // but not every client/browser has it.
    const u = await createUser();
    const [a, b] = await Promise.all([
      api("/auth/refresh", { method: "POST", cookie: u.cookie }),
      api("/auth/refresh", { method: "POST", cookie: u.cookie }),
    ]);
    const winners = [a, b].filter((r) => r.status === 200);
    expect(winners.length).toBeGreaterThanOrEqual(1);
    // Whichever cookie the browser ends up keeping (last response wins),
    // the next refresh must still work.
    const kept = cookiesFrom(winners[winners.length - 1].headers);
    const next = await api("/auth/refresh", { method: "POST", cookie: kept });
    expect(next.status).toBe(200);
  });
});

describe("password reset", () => {
  const requestReset = (email) => api("/auth/forgot-password", { method: "POST", body: { email } });

  // The DB only holds a hash of the token; the real one exists only in the
  // emailed link - read it from the queued email job, as a user would.
  const emailedResetToken = async (email) => {
    const redis = getRedis();
    for (let id = Number(await redis.get("bull:email:id")); id > 0; id--) {
      const job = await redis.hgetall(`bull:email:${id}`);
      const data = job.data && JSON.parse(job.data);
      if (job.name === "password-reset" && data.to === email) return /token=([a-f0-9]+)/.exec(data.html)[1];
    }
    throw new Error(`no reset email queued for ${email}`);
  };

  it("responds identically for registered and unregistered emails", async () => {
    const u = await createUser();
    const known = await requestReset(u.email);
    const unknown = await requestReset(`${uniq()}@nope.test`);
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });

  it("queues a reset email (BullMQ) instead of sending inline", async () => {
    const u = await createUser();
    const redis = getRedis();
    const before = Number(await redis.get("bull:email:id")) || 0;
    await requestReset(u.email);
    const after = Number(await redis.get("bull:email:id")) || 0;
    expect(after).toBe(before + 1);
    const job = await redis.hgetall(`bull:email:${after}`);
    expect(job.name).toBe("password-reset");
    expect(JSON.parse(job.data).to).toBe(u.email);
  });

  it("resets the password with the emailed token exactly once", async () => {
    const u = await createUser();
    await requestReset(u.email);
    const resetPasswordToken = await emailedResetToken(u.email);
    expect(resetPasswordToken).toMatch(/^[a-f0-9]{64}$/);
    // Only a hash of it is stored.
    const db = await connectDb();
    const stored = await db.collection("users").findOne({ email: u.email });
    expect(stored.resetPasswordToken).not.toBe(resetPasswordToken);

    const newPassword = "N3w!Password";
    const ok = await api("/auth/reset-password", { method: "POST", body: { token: resetPasswordToken, newPassword } });
    expect(ok.status).toBe(200);
    const login = await api("/auth/login", { method: "POST", body: { email: u.email, password: newPassword } });
    expect(login.status).toBe(200);

    const reuse = await api("/auth/reset-password", { method: "POST", body: { token: resetPasswordToken, newPassword: "An0ther!Pass" } });
    expect(reuse.status).toBe(400);
  });

  it("rejects an expired reset token", async () => {
    const u = await createUser();
    await requestReset(u.email);
    const resetPasswordToken = await emailedResetToken(u.email);
    const db = await connectDb();
    await db.collection("users").updateOne({ email: u.email }, { $set: { resetPasswordExpires: new Date(Date.now() - 1000) } });
    const res = await api("/auth/reset-password", { method: "POST", body: { token: resetPasswordToken, newPassword: "N3w!Password" } });
    expect(res.status).toBe(400);
  });

  it("SECURITY: a query-operator object as the reset token must not match another user's token (NoSQL injection)", async () => {
    const victim = await createUser();
    // `{$ne: null}` matches whichever user's pending reset sorts first, so
    // make the victim the only account with one pending (earlier tests in
    // this file leave others behind).
    const db = await connectDb();
    await db.collection("users").updateMany({}, { $set: { resetPasswordToken: null, resetPasswordExpires: null } });
    // Anyone can trigger a reset for any email - no auth needed.
    await requestReset(victim.email);

    const attackerPassword = "Pwn3d!Pass";
    const res = await api("/auth/reset-password", {
      method: "POST",
      body: { token: { $ne: null }, newPassword: attackerPassword },
    });
    const takeover = await api("/auth/login", { method: "POST", body: { email: victim.email, password: attackerPassword } });
    // Asserting the impact first: did the attacker end up able to log in as the victim?
    expect(takeover.status, "attacker logged in as victim with the password they chose").not.toBe(200);
    expect(res.status).toBe(400);
  });

  it("SECURITY: password-reset tokens are never exposed through user lookup endpoints", async () => {
    const victim = await createUser();
    const attacker = await createUser();
    await requestReset(victim.email);

    const profile = await api(`/user/${victim.id}`, { token: attacker.token });
    expect(profile.status).toBe(200);
    expect(profile.body.resetPasswordToken ?? null).toBeNull();

    const search = await api(`/user/search?query=${encodeURIComponent(victim.username)}`, { token: attacker.token });
    expect(search.status).toBe(200);
    const hit = search.body.find((u) => u._id === victim.id);
    expect(hit.resetPasswordToken ?? null).toBeNull();
  });

  it("SECURITY: resetting the password revokes the account's existing refresh sessions", async () => {
    const u = await createUser(); // u.cookie = a session that existed before the reset
    await requestReset(u.email);
    const resetPasswordToken = await emailedResetToken(u.email);
    const reset = await api("/auth/reset-password", { method: "POST", body: { token: resetPasswordToken, newPassword: "N3w!Password" } });
    expect(reset.status).toBe(200);
    expect((await api("/auth/me", { token: u.token })).status).toBe(401);

    const stale = await api("/auth/refresh", { method: "POST", cookie: u.cookie });
    expect(stale.status).toBe(403);
  });
});

describe("change password", () => {
  it("signs out other sessions but keeps the session that made the change", async () => {
    const u = await createUser(); // u.token / u.cookie = an "other device" session
    const here = await api("/auth/login", { method: "POST", body: { email: u.email, password: u.password } });
    const hereCookie = cookiesFrom(here.headers);

    const res = await api("/auth/change-password", {
      method: "POST",
      cookie: hereCookie,
      body: { currentPassword: u.password, newPassword: "N3w!Password" },
    });
    expect(res.status).toBe(200);

    expect((await api("/auth/me", { token: u.token })).status).toBe(401);
    expect((await api("/auth/refresh", { method: "POST", cookie: u.cookie })).status).toBe(403);
    expect((await api("/auth/me", { cookie: cookiesFrom(res.headers) })).status).toBe(200);
  });

  it("requires the correct current password", async () => {
    const u = await createUser();
    const bad = await api("/auth/change-password", {
      method: "POST",
      token: u.token,
      body: { currentPassword: "Wrong!Pass1", newPassword: "N3w!Password" },
    });
    expect(bad.status).toBe(401);

    const good = await api("/auth/change-password", {
      method: "POST",
      token: u.token,
      body: { currentPassword: u.password, newPassword: "N3w!Password" },
    });
    expect(good.status).toBe(200);
    await sleep(10);
    const login = await api("/auth/login", { method: "POST", body: { email: u.email, password: "N3w!Password" } });
    expect(login.status).toBe(200);
  });
});
