import { describe, it, expect, afterAll, inject } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  api,
  createUser,
  connectDb,
  connectSocket,
  nextEvent,
  clearRateLimits,
  teardownClients,
  uniq,
  sleep,
  STRONG_PASSWORD,
} from "./helpers/client.js";

const sockets = [];
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await teardownClients();
});

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

describe("deleting a study material removes its file", () => {
  const uploadMaterial = (user) => {
    const form = new FormData();
    form.append("file", new Blob([PNG], { type: "image/png" }), "diagram.png");
    return api("/materials", { method: "POST", token: user.token, form });
  };

  it("deletes the file from disk when the uploader deletes the material", async () => {
    const u = await createUser();
    const m = (await uploadMaterial(u)).body;
    const filename = path.basename(m.fileUrl);
    const onDisk = path.join(inject("uploadsDir"), filename);
    expect(fs.existsSync(onDisk)).toBe(true);

    expect((await api(`/materials/${m.id}`, { method: "DELETE", token: u.token })).status).toBe(200);

    expect(fs.existsSync(onDisk)).toBe(false);
    const served = await fetch(m.fileUrl, { headers: { Authorization: `Bearer ${u.token}` } });
    expect(served.status).toBe(404);
  });

  it("deletes the file when a site admin removes the material (moderation)", async () => {
    const u = await createUser();
    const admin = await createUser({ admin: true });
    const m = (await uploadMaterial(u)).body;
    await api(`/materials/${m.id}`, { method: "DELETE", token: admin.token });
    const served = await fetch(m.fileUrl, { headers: { Authorization: `Bearer ${admin.token}` } });
    expect(served.status).toBe(404);
  });

  it("still succeeds if the file is already missing from disk", async () => {
    const u = await createUser();
    const m = (await uploadMaterial(u)).body;
    fs.rmSync(path.join(inject("uploadsDir"), path.basename(m.fileUrl)));
    expect((await api(`/materials/${m.id}`, { method: "DELETE", token: u.token })).status).toBe(200);
  });
});

describe("only the sender can delete a direct message", () => {
  const sendDm = async (from, to) =>
    (await api("/messages/send", { method: "POST", token: from.token, body: { receiverId: to.id, content: "hi" } })).body.data._id;

  it("refuses the receiver and leaves the message visible to both", async () => {
    const a = await createUser();
    const b = await createUser();
    const id = await sendDm(a, b);

    expect((await api(`/messages/${id}`, { method: "DELETE", token: b.token })).status).toBe(403);
    const convo = await api(`/messages/conversation/${a.id}/${b.id}`, { token: a.token });
    expect(convo.body.some((m) => m._id === id)).toBe(true);
  });

  it("lets the sender unsend it for both people", async () => {
    const a = await createUser();
    const b = await createUser();
    const id = await sendDm(a, b);

    expect((await api(`/messages/${id}`, { method: "DELETE", token: a.token })).status).toBe(200);
    const convo = await api(`/messages/conversation/${a.id}/${b.id}`, { token: b.token });
    expect(convo.body.some((m) => m._id === id)).toBe(false);
  });
});

describe("email addresses are case-insensitive", () => {
  it("stores emails lowercased and trimmed", async () => {
    await clearRateLimits();
    const username = uniq("case");
    const res = await api("/auth/register", {
      method: "POST",
      body: { username, email: `  ${username.toUpperCase()}@Example.TEST `, password: STRONG_PASSWORD },
    });
    expect(res.status).toBe(201);
    const db = await connectDb();
    expect((await db.collection("users").findOne({ username })).email).toBe(`${username}@example.test`);
  });

  it("logs in regardless of the capitalization typed", async () => {
    const u = await createUser();
    const login = await api("/auth/login", { method: "POST", body: { email: u.email.toUpperCase(), password: u.password } });
    expect(login.status).toBe(200);
  });

  it("rejects registering a capitalization variant of an existing email", async () => {
    const u = await createUser();
    const res = await api("/auth/register", {
      method: "POST",
      body: { username: uniq("dup"), email: u.email.toUpperCase(), password: STRONG_PASSWORD },
    });
    expect(res.status).toBe(400);
  });

  it("rejects changing your email to a capitalization variant of someone else's", async () => {
    const a = await createUser();
    const b = await createUser();
    const res = await api(`/user/${a.id}`, { method: "PATCH", token: a.token, body: { email: b.email.toUpperCase() } });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Email already in use");
  });

  it("sends a password reset when the email is typed with different capitalization", async () => {
    const u = await createUser();
    await api("/auth/forgot-password", { method: "POST", body: { email: u.email.toUpperCase() } });
    const db = await connectDb();
    const stored = await db.collection("users").findOne({ email: u.email });
    expect(stored.resetPasswordToken).toBeTruthy();
  });

  describe("migration script (scripts/normalize-emails.js)", () => {
    const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/normalize-emails.js");
    const run = (...args) =>
      spawnSync(process.execPath, [script, ...args], {
        cwd: os.tmpdir(), // never pick up the developer's own .env
        env: { PATH: process.env.PATH, MONGO_URI: inject("mongoUri") },
        encoding: "utf8",
      });

    it("refuses to change anything while case-only duplicates exist, then lowercases everything", async () => {
      const db = await connectDb();
      const users = db.collection("users");
      const base = uniq("mig");
      await users.insertMany([
        { username: `${base}a`, email: `${base}@Example.test` },
        { username: `${base}b`, email: `${base}@example.TEST` },
        { username: `${base}c`, email: `  ${base}-Solo@Example.test` },
      ]);

      const blocked = run("--apply");
      expect(blocked.status).not.toBe(0);
      expect(blocked.stdout + blocked.stderr).toContain(`${base}@example.test`);
      expect((await users.findOne({ username: `${base}c` })).email).toBe(`  ${base}-Solo@Example.test`);

      // Resolve the collision the way an operator would, then apply.
      await users.deleteOne({ username: `${base}b` });

      const dryRun = run();
      expect(dryRun.status).toBe(0);
      expect((await users.findOne({ username: `${base}c` })).email).toBe(`  ${base}-Solo@Example.test`);

      const applied = run("--apply");
      expect(applied.status, applied.stderr).toBe(0);
      expect((await users.findOne({ username: `${base}a` })).email).toBe(`${base}@example.test`);
      expect((await users.findOne({ username: `${base}c` })).email).toBe(`${base}-solo@example.test`);
    });
  });
});

describe("direct-message notifications reach offline receivers", () => {
  it("creates a notification for a receiver who is offline when the DM is sent", async () => {
    const a = await createUser();
    const b = await createUser(); // never connects a socket
    const sa = await connectSocket(a.token);
    sockets.push(sa);
    const sent = nextEvent(sa, "messageSent");
    sa.emit("sendDirectMessage", { receiver: b.id, content: "while you were out" });
    expect((await sent).status).toBe("sent");
    await sleep(200);

    const notifications = await api("/notifications", { token: b.token });
    const dm = notifications.body.find((n) => n.type === "direct_message" && n.sender === a.id);
    expect(dm?.content).toBe("while you were out");
  });

  it("still does not notify when the receiver has blocked the sender", async () => {
    const a = await createUser();
    const b = await createUser();
    await api("/user/block", { method: "POST", token: b.token, body: { targetUserId: a.id } });
    const sa = await connectSocket(a.token);
    sockets.push(sa);
    sa.emit("sendDirectMessage", { receiver: b.id, content: "blocked" });
    await sleep(400);
    const notifications = await api("/notifications", { token: b.token });
    expect(notifications.body.some((n) => n.sender === a.id)).toBe(false);
  });
});
