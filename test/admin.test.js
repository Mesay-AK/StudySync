import { describe, it, expect, afterAll } from "vitest";
import { api, baseUrl, createUser, createRoom, connectDb, getRedis, teardownClients, uniq, STRONG_PASSWORD } from "./helpers/client.js";

afterAll(teardownClients);

describe("site-admin gate", () => {
  it("rejects non-admins on every site-admin endpoint", async () => {
    const u = await createUser();
    const victim = await createUser();
    const calls = [
      ["/admin/reports", "GET"],
      ["/admin/resolve-report", "POST", { reportId: "000000000000000000000000" }],
      ["/admin/delete-user", "POST", { userId: victim.id }],
      ["/admin/toggle-user", "POST", { userId: victim.id }],
      ["/admin/adRegister", "POST", { username: uniq(), email: `${uniq()}@x.test`, password: STRONG_PASSWORD }],
      ["/analytics/admin/overview", "GET"],
      ["/chatrooms/admin/all", "GET"],
      ["/contact", "GET"],
      ["/announcements", "POST", { title: "t", content: "c" }],
    ];
    for (const [path, method, body] of calls) {
      const res = await api(path, { method, token: u.token, body });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
    const db = await connectDb();
    const stored = await db.collection("users").findOne({ email: victim.email });
    expect(stored.isBanned).toBe(false);
  });

  it("lets an admin create another admin, ban/unban, and delete users", async () => {
    const admin = await createUser({ admin: true });
    const target = await createUser();

    const email = `${uniq()}@x.test`;
    expect((await api("/admin/adRegister", { method: "POST", token: admin.token, body: { username: uniq(), email, password: STRONG_PASSWORD } })).status).toBe(201);
    const db = await connectDb();
    expect((await db.collection("users").findOne({ email })).isAdmin).toBe(true);

    expect((await api("/admin/toggle-user", { method: "POST", token: admin.token, body: { userId: target.id, ban: true } })).status).toBe(200);
    expect((await api("/auth/me", { token: target.token })).status).toBe(403);
    expect((await api("/admin/toggle-user", { method: "POST", token: admin.token, body: { userId: target.id, ban: false } })).status).toBe(200);
    expect((await api("/auth/me", { token: target.token })).status).toBe(200);

    expect((await api("/admin/delete-user", { method: "POST", token: admin.token, body: { userId: target.id } })).status).toBe(200);
    expect((await api("/auth/me", { token: target.token })).status).toBe(401);
  });

  it("resolves a room-message report with banUser / deleteMessage", async () => {
    const admin = await createUser({ admin: true });
    const owner = await createUser();
    const room = await createRoom(owner);
    const reporter = await createUser();
    await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: reporter.token });
    const msg = (await api(`/chatrooms/${room._id}/send`, { method: "POST", token: owner.token, body: { content: "bad" } })).body;

    expect((await api("/chatrooms/report/message", { method: "POST", token: reporter.token, body: { messageId: msg._id, reason: "r" } })).status).toBe(201);
    expect((await api("/chatrooms/report/user", { method: "POST", token: reporter.token, body: { targetUserId: owner.id, reason: "r" } })).status).toBe(201);
    expect((await api("/chatrooms/report/user", { method: "POST", token: reporter.token, body: { targetUserId: owner.id, reason: "r" } })).status).toBe(400);

    const reports = (await api("/admin/reports", { token: admin.token })).body.reports;
    const msgReport = reports.find((r) => r.targetMessage?._id === msg._id);
    const userReport = reports.find((r) => r.type === "user" && r.targetUser?._id === owner.id);

    await api("/admin/resolve-report", { method: "POST", token: admin.token, body: { reportId: msgReport._id, action: "deleteMessage" } });
    const hist = await api(`/chatrooms/${room._id}/messages`, { token: reporter.token });
    expect(hist.body.some((m) => m._id === msg._id)).toBe(false);

    await api("/admin/resolve-report", { method: "POST", token: admin.token, body: { reportId: userReport._id, action: "banUser" } });
    expect((await api("/auth/me", { token: owner.token })).status).toBe(403);

    const after = (await api("/admin/reports", { token: admin.token })).body.reports;
    expect(after.find((r) => r._id === msgReport._id).status).toBe("reviewed");
  });

  it("returns admin analytics overview with consistent counts", async () => {
    const admin = await createUser({ admin: true });
    const res = await api("/analytics/admin/overview", { token: admin.token });
    expect(res.status).toBe(200);
    const db = await connectDb();
    expect(res.body.totalUsers).toBe(await db.collection("users").countDocuments());
    expect(res.body.signupsPerDay).toHaveLength(7);
  });
});

describe("announcements", () => {
  it("rejects blank, whitespace-only and non-string titles/content", async () => {
    const admin = await createUser({ admin: true });
    for (const body of [{}, { title: "  ", content: "c" }, { title: "t", content: "\n\t " }, { title: 5, content: "c" }]) {
      const res = await api("/announcements", { method: "POST", token: admin.token, body });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("admins see inactive announcements; regular users only see active ones", async () => {
    const admin = await createUser({ admin: true });
    const u = await createUser();
    const a = (await api("/announcements", { method: "POST", token: admin.token, body: { title: uniq(), content: "c" } })).body;
    expect((await api(`/announcements/${a._id}/toggle`, { method: "PATCH", token: admin.token })).body.isActive).toBe(false);
    expect((await api("/announcements", { token: u.token })).body.some((x) => x._id === a._id)).toBe(false);
    expect((await api("/announcements", { token: admin.token })).body.some((x) => x._id === a._id)).toBe(true);
    expect((await api(`/announcements/${a._id}`, { method: "DELETE", token: u.token })).status).toBe(403);
    expect((await api(`/announcements/${a._id}`, { method: "DELETE", token: admin.token })).status).toBe(200);
  });
});

describe("contact form", () => {
  it("validates input and stores a submission without auth", async () => {
    expect((await api("/contact", { method: "POST", body: { name: "a", email: "" , message: "m" } })).status).toBe(400);
    const res = await api("/contact", { method: "POST", body: { name: "Ann", email: "ann@x.test", message: "hi" } });
    expect(res.status).toBe(201);
    const admin = await createUser({ admin: true });
    const list = await api("/contact", { token: admin.token });
    expect(list.body.some((m) => m._id === res.body.id)).toBe(true);
  });

  it("answers non-string fields with a 4xx, not a 500", async () => {
    const res = await api("/contact", { method: "POST", body: { name: 1, email: "a@b.c", message: "m" } });
    expect(res.status).toBeLessThan(500);
  });

  it("SECURITY: escapes submitter-controlled HTML in the notification email sent to staff", async () => {
    await api("/contact", {
      method: "POST",
      body: { name: "Mallory", email: "m@x.test", message: `<a href="https://evil.example">Reset your admin password</a>` },
    });
    const redis = getRedis();
    const id = await redis.get("bull:email:id");
    const job = await redis.hgetall(`bull:email:${id}`);
    expect(job.name).toBe("contact-notification");
    expect(JSON.parse(job.data).html).not.toContain('<a href="https://evil.example">');
  });
});

describe("misc HTTP surface", () => {
  it("health reports both dependencies up; unknown routes 404 as JSON", async () => {
    const health = await (await fetch(`${baseUrl()}/health`)).json();
    expect(health).toEqual({ status: "ok", mongo: "up", redis: "up" });
    const res = await api("/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: "Route not found" });
  });

  it("CORS allows the configured frontend and refuses unknown origins", async () => {
    const ok = await fetch(`${baseUrl()}/api/chatrooms/all`, { headers: { Origin: "http://localhost:5173" } });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    const bad = await fetch(`${baseUrl()}/api/chatrooms/all`, { headers: { Origin: "https://evil.example" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
    expect(bad.status).toBeLessThan(500);
  });

  it("returns a 400 (not a 500 with a stack) for malformed JSON", async () => {
    const res = await fetch(`${baseUrl()}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{bad" });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).not.toMatch(/at .*\.js:\d+/);
  });

  it("the public room list does not expose private rooms", async () => {
    const owner = await createUser();
    const room = await createRoom(owner, { type: "private" });
    const list = await api("/chatrooms/all");
    expect(list.body.some((r) => r._id === room._id)).toBe(false);
  });
});
