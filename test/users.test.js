import { describe, it, expect, afterAll } from "vitest";
import { api, createUser, connectDb, teardownClients, createRoom, uniq } from "./helpers/client.js";

afterAll(teardownClients);

describe("profile ownership (IDOR)", () => {
  it("lets a user update their own profile but not someone else's", async () => {
    const alice = await createUser();
    const bob = await createUser();

    const own = await api(`/user/${alice.id}`, { method: "PATCH", token: alice.token, body: { bio: "hello" } });
    expect(own.status).toBe(200);
    expect(own.body.bio).toBe("hello");

    const other = await api(`/user/${bob.id}`, { method: "PATCH", token: alice.token, body: { bio: "pwned" } });
    expect(other.status).toBe(403);

    const db = await connectDb();
    expect((await db.collection("users").findOne({ email: bob.email })).bio).toBe("");
  });

  it("guards settings, blocked-list and delete endpoints by ownership, but lets a site admin through", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const admin = await createUser({ admin: true });

    expect((await api(`/user/settings/${bob.id}`, { token: alice.token })).status).toBe(403);
    expect((await api(`/user/blocked/${bob.id}`, { token: alice.token })).status).toBe(403);
    expect((await api(`/user/${bob.id}`, { method: "DELETE", token: alice.token })).status).toBe(403);
    expect((await api(`/user/settings/${bob.id}`, { token: admin.token })).status).toBe(200);
  });

  it("cannot escalate to admin, ban-exempt, or change password through the profile update", async () => {
    const u = await createUser();
    const res = await api(`/user/${u.id}`, {
      method: "PATCH",
      token: u.token,
      body: { isAdmin: true, isBanned: false, password: "x", resetPasswordToken: "abc" },
    });
    expect(res.status).toBe(200);
    const db = await connectDb();
    const stored = await db.collection("users").findOne({ email: u.email });
    expect(stored.isAdmin).toBe(false);
    expect(stored.resetPasswordToken ?? null).toBeNull();
  });

  it("rejects taking another user's email or username, leaving both accounts unchanged", async () => {
    const alice = await createUser();
    const bob = await createUser();

    const email = await api(`/user/${alice.id}`, { method: "PATCH", token: alice.token, body: { email: bob.email } });
    const name = await api(`/user/${alice.id}`, { method: "PATCH", token: alice.token, body: { username: bob.username } });
    expect(email.status).toBeGreaterThanOrEqual(400);
    expect(name.status).toBeGreaterThanOrEqual(400);

    const db = await connectDb();
    expect((await db.collection("users").findOne({ username: alice.username })).email).toBe(alice.email);
  });

  it("rejects a taken email via the controller's own duplicate check (400 'Email already in use')", async () => {
    // updateUserProfile has an explicit duplicate check that should answer
    // 400 before save(). If that check is dead code, only the DB unique index
    // stops the write - a 409 from the generic error mapper instead.
    const alice = await createUser();
    const bob = await createUser();
    const res = await api(`/user/${alice.id}`, { method: "PATCH", token: alice.token, body: { email: bob.email } });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Email already in use");
  });
});

describe("status", () => {
  it("accepts every status value the endpoint advertises (online/offline/away/busy)", async () => {
    const u = await createUser();
    for (const onlineStatus of ["online", "offline", "away", "busy"]) {
      const res = await api(`/user/${u.id}/status`, { method: "PATCH", token: u.token, body: { onlineStatus } });
      expect(res.status, `status ${onlineStatus}`).toBe(200);
    }
  });

  it("rejects an unknown status value", async () => {
    const u = await createUser();
    const res = await api(`/user/${u.id}/status`, { method: "PATCH", token: u.token, body: { onlineStatus: "invisible" } });
    expect(res.status).toBe(400);
  });
});

describe("settings", () => {
  it("merges a partial settings update without wiping the other fields", async () => {
    const u = await createUser();
    await api(`/user/settings/${u.id}`, { method: "PATCH", token: u.token, body: { settings: { language: "fr" } } });
    const res = await api(`/user/settings/${u.id}`, { method: "PATCH", token: u.token, body: { settings: { darkMode: true } } });
    expect(res.status).toBe(200);
    const get = await api(`/user/settings/${u.id}`, { token: u.token });
    expect(get.body).toMatchObject({ darkMode: true, language: "fr" });
  });
});

describe("search", () => {
  it("finds users by partial username and treats regex metacharacters literally", async () => {
    const u = await createUser();
    const searcher = await createUser();
    const hit = await api(`/user/search?query=${u.username.slice(0, 8)}`, { token: searcher.token });
    expect(hit.status).toBe(200);
    expect(hit.body.some((x) => x._id === u.id)).toBe(true);

    // "(a+)+$" would be a catastrophic-backtracking pattern if not escaped.
    const evil = await api(`/user/search?query=${encodeURIComponent("(a+)+$")}`, { token: searcher.token });
    expect(evil.status).toBe(200);
    expect(evil.body).toEqual([]);
  });

  it("requires a query", async () => {
    const u = await createUser();
    expect((await api("/user/search", { token: u.token })).status).toBe(400);
  });

  it("answers a repeated query parameter with a 4xx, not a 500", async () => {
    const u = await createUser();
    const res = await api("/user/search?query=a&query=b", { token: u.token });
    expect(res.status).toBeLessThan(500);
  });

  it("SECURITY: user search does not hand any logged-in user other users' private account fields", async () => {
    const victim = await createUser();
    const other = await createUser();
    await api("/user/block", { method: "POST", token: victim.token, body: { targetUserId: other.id } });
    const searcher = await createUser();
    const res = await api(`/user/search?query=${victim.username}`, { token: searcher.token });
    const hit = res.body.find((x) => x._id === victim.id);
    // Who a user has blocked and their personal settings are private to them.
    expect(hit.blockedUsers).toBeUndefined();
    expect(hit.settings).toBeUndefined();
  });
});

describe("blocking", () => {
  it("blocks and unblocks a user, rejecting self-block and duplicates", async () => {
    const alice = await createUser();
    const bob = await createUser();

    expect((await api("/user/block", { method: "POST", token: alice.token, body: { targetUserId: alice.id } })).status).toBe(400);
    expect((await api("/user/block", { method: "POST", token: alice.token, body: { targetUserId: bob.id } })).status).toBe(200);
    expect((await api("/user/block", { method: "POST", token: alice.token, body: { targetUserId: bob.id } })).status).toBe(400);

    const list = await api(`/user/blocked/${alice.id}`, { token: alice.token });
    expect(list.body.map((x) => x._id)).toEqual([bob.id]);

    const unblock = await api(`/user/unblock/${alice.id}`, { method: "PATCH", token: alice.token, body: { targetUserId: bob.id } });
    expect(unblock.status).toBe(200);
    expect(unblock.body.blockedUsers).toEqual([]);
  });

  it("rejects an invalid target id with a 4xx", async () => {
    const alice = await createUser();
    const res = await api("/user/block", { method: "POST", token: alice.token, body: { targetUserId: "not-an-id" } });
    expect(res.status).toBe(400);
  });
});

describe("account deletion", () => {
  it("deleting your account invalidates your token", async () => {
    const u = await createUser();
    expect((await api(`/user/${u.id}`, { method: "DELETE", token: u.token })).status).toBe(200);
    expect((await api("/auth/me", { token: u.token })).status).toBe(401);
  });

  it("deleting an account does not leave the deleted user listed as a room member/admin", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const member = await createUser();
    await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: member.token });

    await api(`/user/${member.id}`, { method: "DELETE", token: member.token });

    const db = await connectDb();
    const stored = await db.collection("chatrooms").findOne({ _id: (await import("./helpers/client.js")).oid(room._id) });
    expect(stored.members.map(String)).not.toContain(member.id);
  });
});

describe("admin user listing", () => {
  it("is admin-only and paginates with clamped limits", async () => {
    const u = await createUser();
    const admin = await createUser({ admin: true });
    expect((await api("/user/admin/all-users", { token: u.token })).status).toBe(403);

    const res = await api("/user/admin/all-users?limit=100000&page=-5", { token: admin.token });
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.users.length).toBeLessThanOrEqual(100);
    expect(res.body.users.every((x) => x.password === undefined)).toBe(true);
  });
});

void uniq;
