import { describe, it, expect, afterAll, inject } from "vitest";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  api,
  createUser,
  createRoom,
  connectDb,
  connectSocket,
  nextEvent,
  oid,
  sleep,
  teardownClients,
  uniq,
} from "./helpers/client.js";

const sockets = [];
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await teardownClients();
});
const socketFor = async (user) => {
  const s = await connectSocket(user.token);
  sockets.push(s);
  return s;
};

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);
const uploadChatFile = async (user) => {
  const form = new FormData();
  form.append("media", new Blob([PNG], { type: "image/png" }), "p.png");
  return (await api("/messages/upload", { method: "POST", token: user.token, form })).body;
};
const fetchAs = (url, user) => fetch(url, user ? { headers: { Authorization: `Bearer ${user.token}` } } : undefined);

describe("per-file upload access", () => {
  it("an unsent attachment is visible only to its uploader (and admins)", async () => {
    const owner = await createUser();
    const other = await createUser();
    const admin = await createUser({ admin: true });
    const { url } = await uploadChatFile(owner);

    expect((await fetchAs(url, owner)).status).toBe(200);
    expect((await fetchAs(url, other)).status).toBe(404);
    expect((await fetchAs(`${url}/download`, other)).status).toBe(404);
    expect((await fetchAs(url, admin)).status).toBe(200);
  });

  it("a DM attachment is visible to both participants and nobody else", async () => {
    const a = await createUser();
    const b = await createUser();
    const eve = await createUser();
    const { url } = await uploadChatFile(a);
    await api("/messages/send", { method: "POST", token: a.token, body: { receiverId: b.id, media: { url, type: "image" } } });

    expect((await fetchAs(url, b)).status).toBe(200);
    expect((await fetchAs(`${url}/download`, b)).status).toBe(200);
    expect((await fetchAs(url, eve)).status).toBe(404);
  });

  it("access to a DM attachment ends when the message is deleted (except for the uploader)", async () => {
    const a = await createUser();
    const b = await createUser();
    const { url } = await uploadChatFile(a);
    const sent = await api("/messages/send", { method: "POST", token: a.token, body: { receiverId: b.id, media: { url, type: "image" } } });
    await api(`/messages/${sent.body.data._id}`, { method: "DELETE", token: a.token });
    expect((await fetchAs(url, b)).status).toBe(404);
    expect((await fetchAs(url, a)).status).toBe(200);
  });

  it("a room attachment is visible to room members only", async () => {
    const owner = await createUser();
    const member = await createUser();
    const outsider = await createUser();
    const room = await createRoom(owner);
    await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: member.token });
    const { url } = await uploadChatFile(owner);
    const s = await socketFor(owner);
    const echoed = nextEvent(s, "receiveMessage");
    s.emit("sendPrivateMessage", { roomId: room._id, content: "", media: { url, type: "image" } });
    await echoed;

    expect((await fetchAs(url, member)).status).toBe(200);
    expect((await fetchAs(url, outsider)).status).toBe(404);
  });

  it("a study material is visible to any logged-in user, but not anonymously", async () => {
    const owner = await createUser();
    const reader = await createUser();
    const form = new FormData();
    form.append("file", new Blob([PNG], { type: "image/png" }), "d.png");
    const m = (await api("/materials", { method: "POST", token: owner.token, form })).body;
    expect((await fetchAs(m.fileUrl, reader)).status).toBe(200);
    expect((await fetchAs(m.fileUrl)).status).toBe(401);
  });

  it("files uploaded before upload tracking existed are still reachable through the message that uses them", async () => {
    const a = await createUser();
    const b = await createUser();
    const { url } = await uploadChatFile(a);
    const db = await connectDb();
    await db.collection("uploads").deleteOne({ filename: url.split("/").pop() }); // a legacy file
    await api("/messages/send", { method: "POST", token: a.token, body: { receiverId: b.id, media: { url, type: "image" } } });
    expect((await fetchAs(url, b)).status).toBe(200);
  });

  it("answers 404 (not an error) for a file that does not exist or a malformed name", async () => {
    const u = await createUser();
    expect((await fetchAs(`${inject("baseUrl")}/uploads/media-1-1.png`, u)).status).toBe(404);
    expect((await fetchAs(`${inject("baseUrl")}/uploads/%E0%A4%A`, u)).status).toBe(404);
  });
});

describe("socket session expiry", () => {
  it("ends a socket when its access token expires, announcing it first", async () => {
    const u = await createUser();
    await import("../src/compat/slowBufferShim.js");
    const jwt = (await import("jsonwebtoken")).default;
    const shortLived = jwt.sign({ userId: u.id, email: u.email, tokenVersion: 0 }, "test-access-secret", { expiresIn: 2, algorithm: "HS256" });
    const s = await socketFor({ token: shortLived });
    let announcedAt = null;
    s.once("session_expired", () => { announcedAt = Date.now(); });
    const reason = await new Promise((r) => s.once("disconnect", r));
    expect(announcedAt, "session_expired was announced before the disconnect").not.toBeNull();
    expect(reason).toBe("io server disconnect");
  });

  it("does not end a socket whose token is still valid", async () => {
    const u = await createUser();
    const s = await socketFor(u);
    await sleep(1000);
    expect(s.connected).toBe(true);
  });
});

describe("room notifications are grouped", () => {
  const roomWithMember = async () => {
    const owner = await createUser();
    const member = await createUser();
    const room = await createRoom(owner);
    await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: member.token });
    const s = await socketFor(owner);
    return { owner, member, room, s };
  };
  const send = async (s, roomId, content) => {
    const echoed = nextEvent(s, "receiveMessage");
    s.emit("sendPrivateMessage", { roomId, content });
    await echoed;
  };
  const roomNotifications = async (member, roomId) =>
    (await api("/notifications", { token: member.token })).body.filter((n) => n.type === "room_message" && n.metadata?.roomId === roomId);

  it("several messages produce ONE unread notification with a running count and the latest text", async () => {
    const { member, room, s } = await roomWithMember();
    for (const text of ["one", "two", "three"]) await send(s, room._id, text);
    await sleep(200);
    const list = await roomNotifications(member, room._id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ content: "three", isRead: false, metadata: { count: 3, roomId: room._id, roomName: room.name } });
  });

  it("once read, the next message starts a fresh notification", async () => {
    const { member, room, s } = await roomWithMember();
    await send(s, room._id, "first");
    await sleep(200);
    const [n] = await roomNotifications(member, room._id);
    await api(`/notifications/${n._id}/read`, { method: "PATCH", token: member.token });
    await send(s, room._id, "second");
    await sleep(200);
    const list = await roomNotifications(member, room._id);
    expect(list).toHaveLength(2);
    expect(list.find((x) => !x.isRead)).toMatchObject({ content: "second", metadata: { count: 1 } });
  });

  it("a burst of simultaneous messages still yields exactly one unread notification", async () => {
    const { member, room, s } = await roomWithMember();
    for (let i = 0; i < 8; i++) s.emit("sendPrivateMessage", { roomId: room._id, content: `burst ${i}` });
    await sleep(1500);
    const list = await roomNotifications(member, room._id);
    expect(list).toHaveLength(1);
    expect(list[0].metadata.count).toBe(8);
  });

  it("members who are viewing the room get no notification (they see the message live)", async () => {
    const { member, room, s } = await roomWithMember();
    const ms = await socketFor(member);
    ms.emit("joinRoom", { roomId: room._id });
    await nextEvent(ms, "previousMessages");
    const live = nextEvent(ms, "receiveMessage");
    await send(s, room._id, "you are watching");
    expect((await live).content).toBe("you are watching");
    await sleep(200);
    expect(await roomNotifications(member, room._id)).toHaveLength(0);
  });

  it("re-emits the SAME notification id as it updates, so clients can replace it", async () => {
    const { member, room, s } = await roomWithMember();
    const ms = await socketFor(member);
    const first = nextEvent(ms, "newNotification");
    await send(s, room._id, "a");
    const n1 = await first;
    const second = nextEvent(ms, "newNotification");
    await send(s, room._id, "b");
    const n2 = await second;
    expect(n2._id).toBe(n1._id);
    expect(n2.metadata.count).toBe(2);
  });
});

describe("GET /messages/unread", () => {
  it("excludes messages from blocked users and is paginated", async () => {
    const me = await createUser();
    const friend = await createUser();
    const pest = await createUser();
    for (let i = 0; i < 3; i++) await api("/messages/send", { method: "POST", token: friend.token, body: { receiverId: me.id, content: `f${i}` } });
    await api("/messages/send", { method: "POST", token: pest.token, body: { receiverId: me.id, content: "spam" } });
    await api("/user/block", { method: "POST", token: me.token, body: { targetUserId: pest.id } });

    const all = await api("/messages/unread", { token: me.token });
    expect(all.body.map((m) => m.content).sort()).toEqual(["f0", "f1", "f2"]);
    const page = await api("/messages/unread?limit=2", { token: me.token });
    expect(page.body).toHaveLength(2);
  });
});

describe("materials sorted by likes", () => {
  it("orders by like count in the database and paginates correctly", async () => {
    const owner = await createUser();
    const subject = uniq("likes");
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const form = new FormData();
      form.append("file", new Blob([PNG], { type: "image/png" }), `m${i}.png`);
      form.append("subject", subject);
      form.append("name", `M${i}`);
      ids.push((await api("/materials", { method: "POST", token: owner.token, form })).body.id);
    }
    const likers = await Promise.all([createUser(), createUser()]);
    // M2: 2 likes, M0: 1 like, M1: 0 likes.
    for (const l of likers) await api(`/materials/${ids[2]}/like`, { method: "PATCH", token: l.token });
    await api(`/materials/${ids[0]}/like`, { method: "PATCH", token: likers[0].token });

    const page1 = await api(`/materials?subject=${subject}&sortBy=likes&limit=2&page=1`, { token: owner.token });
    expect(page1.body.materials.map((m) => [m.name, m.likes])).toEqual([["M2", 2], ["M0", 1]]);
    expect(page1.body.materials[0].uploader).toBe(owner.username);
    const page2 = await api(`/materials?subject=${subject}&sortBy=likes&limit=2&page=2`, { token: owner.token });
    expect(page2.body.materials.map((m) => m.name)).toEqual(["M1"]);
  });
});

describe("display settings", () => {
  it("new accounts default to dark mode and English", async () => {
    const u = await createUser();
    expect((await api(`/user/settings/${u.id}`, { token: u.token })).body).toMatchObject({ darkMode: true, language: "en" });
  });

  it("accepts every supported language and rejects anything else", async () => {
    const u = await createUser();
    for (const language of ["en", "es", "fr", "am", "ar"]) {
      expect((await api(`/user/settings/${u.id}`, { method: "PATCH", token: u.token, body: { settings: { language } } })).status, language).toBe(200);
    }
    for (const language of ["de", "", 5, "EN"]) {
      expect((await api(`/user/settings/${u.id}`, { method: "PATCH", token: u.token, body: { settings: { language } } })).status, String(language)).toBe(400);
    }
  });
});

describe("one-time migration scripts", () => {
  const scriptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts");
  const run = (name, ...args) =>
    spawnSync(process.execPath, [path.join(scriptsDir, name), ...args], {
      cwd: os.tmpdir(),
      env: { PATH: process.env.PATH, MONGO_URI: inject("mongoUri") },
      encoding: "utf8",
    });

  it("default-dark-mode.js: dry run changes nothing, --apply turns every account to dark", async () => {
    const db = await connectDb();
    const users = db.collection("users");
    const u = await createUser();
    await users.updateOne({ email: u.email }, { $set: { "settings.darkMode": false } });

    expect(run("default-dark-mode.js").status).toBe(0);
    expect((await users.findOne({ email: u.email })).settings.darkMode).toBe(false);
    const applied = run("default-dark-mode.js", "--apply");
    expect(applied.status, applied.stderr).toBe(0);
    expect((await users.findOne({ email: u.email })).settings.darkMode).toBe(true);
  });

  it("dedupe-pending-reports.js keeps the oldest pending duplicate and leaves distinct/reviewed reports alone", async () => {
    const db = await connectDb();
    const reports = db.collection("reports");
    // The unique index would refuse these duplicates; drop it to simulate a
    // database from before it existed, and restore it afterwards.
    const indexes = await reports.indexes();
    const unique = indexes.find((i) => i.unique && i.partialFilterExpression);
    if (unique) await reports.dropIndex(unique.name);
    try {
      const by = oid((await createUser()).id);
      const target = oid((await createUser()).id);
      const base = { type: "user", reportedBy: by, targetUser: target, reason: "r" };
      const t0 = new Date(Date.now() - 3000);
      const inserted = await reports.insertMany([
        { ...base, status: "pending", createdAt: t0 },
        { ...base, status: "pending", createdAt: new Date(t0.getTime() + 1000) },
        { ...base, status: "pending", createdAt: new Date(t0.getTime() + 2000) },
        { ...base, status: "reviewed", createdAt: t0 },
      ]);
      const ids = Object.values(inserted.insertedIds);

      expect(run("dedupe-pending-reports.js").status).toBe(0);
      expect(await reports.countDocuments({ reportedBy: by })).toBe(4);

      const applied = run("dedupe-pending-reports.js", "--apply");
      expect(applied.status, applied.stderr).toBe(0);
      const left = await reports.find({ reportedBy: by }).toArray();
      expect(left.map((r) => String(r._id)).sort()).toEqual([String(ids[0]), String(ids[3])].sort());
    } finally {
      if (unique) await reports.createIndex(unique.key, { unique: true, partialFilterExpression: unique.partialFilterExpression, name: unique.name });
    }
  });
});
