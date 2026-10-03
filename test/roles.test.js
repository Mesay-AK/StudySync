// Site roles: super admin > admin > user (src/utils/roles.js).
import { describe, it, expect, afterAll, inject } from "vitest";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { api, connectDb, createUser, teardownClients, uniq, STRONG_PASSWORD } from "./helpers/client.js";

afterAll(teardownClients);

const ban = (actor, target, banIt = true) =>
  api("/admin/toggle-user", { method: "POST", token: actor.token, body: { userId: target.id, ban: banIt } });
const remove = (actor, target) => api("/admin/delete-user", { method: "POST", token: actor.token, body: { userId: target.id } });
const setRole = (actor, target, isAdmin) => api("/admin/role", { method: "PATCH", token: actor.token, body: { userId: target.id, isAdmin } });
const userDoc = async (u) => (await connectDb()).collection("users").findOne({ email: u.email });

describe("who can ban and delete whom", () => {
  it("an admin moderates regular users", async () => {
    const admin = await createUser({ admin: true });
    const user = await createUser();
    expect((await ban(admin, user)).status).toBe(200);
    expect((await remove(admin, user)).status).toBe(200);
  });

  it("an admin cannot ban or delete another admin, a super admin, or themselves", async () => {
    const admin = await createUser({ admin: true });
    const peer = await createUser({ admin: true });
    const boss = await createUser({ superAdmin: true });
    for (const target of [peer, boss, admin]) {
      expect((await ban(admin, target)).status).toBe(403);
      expect((await remove(admin, target)).status).toBe(403);
    }
    expect((await userDoc(peer)).isBanned).toBe(false);
    expect((await userDoc(boss)).isBanned).toBe(false);
  });

  it("a super admin can ban and delete admins and users, but not another super admin or themselves", async () => {
    const boss = await createUser({ superAdmin: true });
    const otherBoss = await createUser({ superAdmin: true });
    const admin = await createUser({ admin: true });
    expect((await ban(boss, admin)).status).toBe(200);
    expect((await ban(boss, admin, false)).status).toBe(200);
    expect((await ban(boss, otherBoss)).status).toBe(403);
    expect((await ban(boss, boss)).status).toBe(403);
    expect((await remove(boss, otherBoss)).status).toBe(403);
    expect((await remove(boss, admin)).status).toBe(200);
  });

  it("resolving a report with 'ban user' follows the same rules", async () => {
    const admin = await createUser({ admin: true });
    const peer = await createUser({ admin: true });
    const reporter = await createUser();
    await api("/chatrooms/report/user", { method: "POST", token: reporter.token, body: { targetUserId: peer.id, reason: "r" } });
    const db = await connectDb();
    const report = await db.collection("reports").findOne({ targetUser: (await userDoc(peer))._id });
    const res = await api("/admin/resolve-report", { method: "POST", token: admin.token, body: { reportId: String(report._id), action: "banUser" } });
    expect(res.status).toBe(403);
    expect((await userDoc(peer)).isBanned).toBe(false);
    expect((await db.collection("reports").findOne({ _id: report._id })).status).toBe("pending");
  });
});

describe("profile and settings edits by staff", () => {
  it("SECURITY: an admin cannot change a super admin's (or another admin's) email - the first step of an account takeover", async () => {
    const admin = await createUser({ admin: true });
    const boss = await createUser({ superAdmin: true });
    const peer = await createUser({ admin: true });
    for (const target of [boss, peer]) {
      const res = await api(`/user/${target.id}`, { method: "PATCH", token: admin.token, body: { email: `${uniq()}@evil.test` } });
      expect(res.status).toBe(403);
      expect((await userDoc(target)).email).toBe(target.email);
    }
  });

  it("staff can still edit lower-ranked accounts, and everyone can edit their own", async () => {
    const admin = await createUser({ admin: true });
    const boss = await createUser({ superAdmin: true });
    const user = await createUser();
    expect((await api(`/user/${user.id}`, { method: "PATCH", token: admin.token, body: { bio: "moderated" } })).status).toBe(200);
    expect((await api(`/user/${admin.id}`, { method: "PATCH", token: boss.token, body: { bio: "by boss" } })).status).toBe(200);
    expect((await api(`/user/${boss.id}`, { method: "PATCH", token: boss.token, body: { bio: "mine" } })).status).toBe(200);
    expect((await api(`/user/settings/${boss.id}`, { token: admin.token })).status).toBe(403);
  });

  it("an admin cannot delete a super admin's account through the profile route", async () => {
    const admin = await createUser({ admin: true });
    const boss = await createUser({ superAdmin: true });
    expect((await api(`/user/${boss.id}`, { method: "DELETE", token: admin.token })).status).toBe(403);
  });
});

describe("granting admin rights", () => {
  it("only a super admin can create admins or promote/demote them", async () => {
    const admin = await createUser({ admin: true });
    const boss = await createUser({ superAdmin: true });
    const user = await createUser();

    const body = { username: uniq(), email: `${uniq()}@x.test`, password: STRONG_PASSWORD };
    expect((await api("/admin/adRegister", { method: "POST", token: admin.token, body })).status).toBe(403);
    expect((await setRole(admin, user, true)).status).toBe(403);
    expect((await userDoc(user)).isAdmin).toBe(false);

    const promoted = await setRole(boss, user, true);
    expect(promoted.status).toBe(200);
    expect(promoted.body.user).toMatchObject({ isAdmin: true, isSuperAdmin: false });
    // Takes effect on the very next request - the role is read per request.
    expect((await api("/admin/reports", { token: user.token })).status).toBe(200);

    expect((await setRole(boss, user, false)).status).toBe(200);
    expect((await api("/admin/reports", { token: user.token })).status).toBe(403);
  });

  it("super admin status can't be changed through the app, nor can a super admin change their own role", async () => {
    const boss = await createUser({ superAdmin: true });
    const otherBoss = await createUser({ superAdmin: true });
    expect((await setRole(boss, otherBoss, false)).status).toBe(403);
    expect((await setRole(boss, boss, false)).status).toBe(403);
    expect((await userDoc(otherBoss)).isSuperAdmin).toBe(true);
  });

  it("validates the request", async () => {
    const boss = await createUser({ superAdmin: true });
    const user = await createUser();
    expect((await api("/admin/role", { method: "PATCH", token: boss.token, body: { userId: user.id, isAdmin: "yes" } })).status).toBe(400);
    expect((await api("/admin/role", { method: "PATCH", token: boss.token, body: { userId: "nope", isAdmin: true } })).status).toBe(400);
    expect((await api("/admin/role", { method: "PATCH", token: boss.token, body: { userId: "000000000000000000000000", isAdmin: true } })).status).toBe(404);
  });

  it("the user list exposes roles and can filter super admins", async () => {
    const boss = await createUser({ superAdmin: true });
    const res = await api(`/user/admin/all-users?role=superadmin&search=${boss.username}`, { token: boss.token });
    expect(res.body.users.map((u) => u._id)).toEqual([boss.id]);
    expect(res.body.users[0]).toMatchObject({ isAdmin: true, isSuperAdmin: true });
  });
});

describe("there is always a super admin", () => {
  it("the last super admin cannot delete their own account; one of several can", async () => {
    const db = await connectDb();
    // Make this the only super admin for the duration of the check.
    const others = await db.collection("users").find({ isSuperAdmin: true }).project({ _id: 1 }).toArray();
    await db.collection("users").updateMany({ isSuperAdmin: true }, { $set: { isSuperAdmin: false } });
    try {
      const only = await createUser({ superAdmin: true });
      expect((await api(`/user/${only.id}`, { method: "DELETE", token: only.token })).status).toBe(400);
      const second = await createUser({ superAdmin: true });
      expect((await api(`/user/${second.id}`, { method: "DELETE", token: second.token })).status).toBe(200);
    } finally {
      if (others.length) await db.collection("users").updateMany({ _id: { $in: others.map((o) => o._id) } }, { $set: { isSuperAdmin: true } });
    }
  });
});

describe("scripts/make-admin.js", () => {
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/make-admin.js");
  const run = (args, env = {}) =>
    spawnSync(process.execPath, [script, ...args], {
      cwd: os.tmpdir(),
      env: { PATH: process.env.PATH, MONGO_URI: inject("mongoUri"), ...env },
      encoding: "utf8",
    });

  it("dry-runs by default, then promotes an existing account to admin and to super admin", async () => {
    const u = await createUser();
    const dry = run([u.email.toUpperCase()]);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain("user -> admin");
    expect((await userDoc(u)).isAdmin).toBe(false);

    expect(run([u.email, "--apply"]).status).toBe(0);
    expect(await userDoc(u)).toMatchObject({ isAdmin: true, isSuperAdmin: false });
    expect(run([u.email, "--super", "--apply"]).status).toBe(0);
    expect(await userDoc(u)).toMatchObject({ isAdmin: true, isSuperAdmin: true });
    // ...and the new super admin really has the powers.
    expect((await api("/admin/adRegister", { method: "POST", token: u.token, body: { username: uniq(), email: `${uniq()}@x.test`, password: STRONG_PASSWORD } })).status).toBe(201);
  });

  it("creates a brand-new super admin that can log in, with the password taken from ADMIN_PASSWORD", async () => {
    const email = `${uniq("boss")}@Example.TEST`;
    const username = uniq("boss");
    const res = run([email, "--create", "--username", username, "--super", "--apply"], { ADMIN_PASSWORD: "Sup3r!Secret" });
    expect(res.status, res.stderr).toBe(0);
    const login = await api("/auth/login", { method: "POST", body: { email: email.toLowerCase(), password: "Sup3r!Secret" } });
    expect(login.status).toBe(200);
    const me = await api("/auth/me", { token: login.body.token });
    expect(me.body).toMatchObject({ username, isAdmin: true, isSuperAdmin: true, settings: { darkMode: true, language: "en" } });
  });

  it("refuses weak or missing passwords and unknown emails without --create", async () => {
    const email = `${uniq()}@x.test`;
    expect(run([email, "--apply"]).status).not.toBe(0);
    expect(run([email, "--create", "--username", uniq(), "--apply"]).status).not.toBe(0);
    expect(run([email, "--create", "--username", uniq(), "--apply"], { ADMIN_PASSWORD: "weak" }).status).not.toBe(0);
    expect(await (await connectDb()).collection("users").findOne({ email })).toBeNull();
  });

  it("revokes rights, but never removes the last super admin", async () => {
    const db = await connectDb();
    const others = await db.collection("users").find({ isSuperAdmin: true }).project({ _id: 1 }).toArray();
    await db.collection("users").updateMany({ isSuperAdmin: true }, { $set: { isSuperAdmin: false } });
    try {
      const only = await createUser({ superAdmin: true });
      const refused = run([only.email, "--revoke", "--apply"]);
      expect(refused.status).not.toBe(0);
      expect(refused.stderr).toMatch(/last super admin/);
      expect((await userDoc(only)).isSuperAdmin).toBe(true);

      const admin = await createUser({ admin: true });
      expect(run([admin.email, "--revoke", "--apply"]).status).toBe(0);
      expect(await userDoc(admin)).toMatchObject({ isAdmin: false, isSuperAdmin: false });
    } finally {
      if (others.length) await db.collection("users").updateMany({ _id: { $in: others.map((o) => o._id) } }, { $set: { isSuperAdmin: true } });
    }
  });

  it("rejects contradictory flags", () => {
    expect(run(["a@b.c", "--super", "--revoke"]).status).not.toBe(0);
  });
});
