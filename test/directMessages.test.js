import { describe, it, expect, afterAll } from "vitest";
import {
  api,
  createUser,
  connectDb,
  connectSocket,
  nextEvent,
  oid,
  sleep,
  teardownClients,
} from "./helpers/client.js";

const sockets = [];
const socketFor = async (user) => {
  const s = await connectSocket(user.token);
  sockets.push(s);
  return s;
};

afterAll(async () => {
  sockets.forEach((s) => s.close());
  await teardownClients();
});

const dmCount = async (from, to) =>
  (await connectDb()).collection("directmessages").countDocuments({ sender: oid(from.id), receiver: oid(to.id) });

describe("socket authentication", () => {
  it("refuses a handshake with no token, a bad token, or a banned user's token", async () => {
    await expect(connectSocket(undefined)).rejects.toThrow(/Authentication required/);
    await expect(connectSocket("garbage")).rejects.toThrow(/Authentication failed/);

    const u = await createUser();
    const db = await connectDb();
    await db.collection("users").updateOne({ email: u.email }, { $set: { isBanned: true } });
    await expect(connectSocket(u.token)).rejects.toThrow(/banned/);
  });

  it("SECURITY: banning a user cuts off a socket they already had open", async () => {
    const u = await createUser();
    const peer = await createUser();
    const s = await socketFor(u);
    const sp = await socketFor(peer);

    const db = await connectDb();
    await db.collection("users").updateOne({ email: u.email }, { $set: { isBanned: true } });
    // Use the real admin endpoint too, in case it does extra work beyond the flag.
    const admin = await createUser({ admin: true });
    await api("/admin/toggle-user", { method: "POST", token: admin.token, body: { userId: u.id, ban: true } });

    const got = nextEvent(sp, "receiveDirectMessage");
    s.emit("sendDirectMessage", { receiver: peer.id, content: "still here after ban" });
    expect(await got).toBeUndefined();
    expect(await dmCount(u, peer)).toBe(0);
  });

  it("marks a user online on connect and offline only when their last socket disconnects", async () => {
    const u = await createUser();
    const viewer = await createUser();
    const s1 = await socketFor(u);
    const s2 = await socketFor(u);
    expect((await api(`/user/${u.id}/status`, { token: viewer.token })).body.onlineStatus).toBe("online");

    s1.close();
    await sleep(300);
    expect((await api(`/user/${u.id}/status`, { token: viewer.token })).body.onlineStatus).toBe("online");

    s2.close();
    await sleep(300);
    expect((await api(`/user/${u.id}/status`, { token: viewer.token })).body.onlineStatus).toBe("offline");
    const db = await connectDb();
    expect((await db.collection("users").findOne({ email: u.email })).onlineStatus).toBe("offline");
  });
});

describe("sending direct messages over the socket", () => {
  it("delivers to every tab of an online receiver, persists as 'delivered', and notifies", async () => {
    const a = await createUser();
    const b = await createUser();
    const sa = await socketFor(a);
    const [sb1, sb2] = await Promise.all([socketFor(b), socketFor(b)]);

    const r1 = nextEvent(sb1, "receiveDirectMessage");
    const r2 = nextEvent(sb2, "receiveDirectMessage");
    const sent = nextEvent(sa, "messageSent");
    const notif = nextEvent(sb1, "newNotification");
    sa.emit("sendDirectMessage", { receiver: b.id, content: "hello 🎉" });

    const [m1, m2, echo] = await Promise.all([r1, r2, sent]);
    expect(m1.content).toBe("hello 🎉");
    expect(m2._id).toBe(m1._id);
    expect(echo._id).toBe(m1._id);
    expect(m1.status).toBe("delivered");
    expect(m1.emojis).toEqual(["🎉"]);
    expect((await notif).type).toBe("direct_message");

    const convo = await api(`/messages/conversation/${a.id}/${b.id}`, { token: b.token });
    expect(convo.body[0]._id).toBe(m1._id);
  });

  it("stores a message to an offline receiver as 'sent' and shows it as unread in conversations", async () => {
    const a = await createUser();
    const b = await createUser();
    const sa = await socketFor(a);
    const sent = nextEvent(sa, "messageSent");
    sa.emit("sendDirectMessage", { receiver: b.id, content: "are you there" });
    expect((await sent).status).toBe("sent");

    const convos = await api("/messages/conversations", { token: b.token });
    const row = convos.body.find((c) => c.user._id === a.id);
    expect(row.unreadCount).toBe(1);
    expect(row.lastMessage.content).toBe("are you there");

    const seen = await api(`/messages/conversation/${a.id}/seen`, { method: "PATCH", token: b.token });
    expect(seen.body.updatedCount).toBe(1);
    const after = await api("/messages/conversations", { token: b.token });
    expect(after.body.find((c) => c.user._id === a.id).unreadCount).toBe(0);
  });

  it("silently drops messages from a sender the receiver has blocked", async () => {
    const a = await createUser();
    const b = await createUser();
    await api("/user/block", { method: "POST", token: b.token, body: { targetUserId: a.id } });
    const [sa, sb] = await Promise.all([socketFor(a), socketFor(b)]);
    const got = nextEvent(sb, "receiveDirectMessage");
    sa.emit("sendDirectMessage", { receiver: b.id, content: "let me in" });
    expect(await got).toBeUndefined();
    expect(await dmCount(a, b)).toBe(0);
  });

  it("rejects blank content and unknown receivers", async () => {
    const a = await createUser();
    const sa = await socketFor(a);
    let err = nextEvent(sa, "error");
    sa.emit("sendDirectMessage", { receiver: a.id, content: "   " });
    expect((await err).message).toMatch(/Invalid/);

    err = nextEvent(sa, "error");
    sa.emit("sendDirectMessage", { receiver: "000000000000000000000000", content: "hi" });
    expect((await err).message).toMatch(/no longer exists/);
  });

  it("SECURITY: rejects attachments whose URL was not issued by this server's upload endpoint", async () => {
    const a = await createUser();
    const b = await createUser();
    const sa = await socketFor(a);
    // The frontend renders media.url straight into <img src>/<a href>.
    sa.emit("sendDirectMessage", {
      receiver: b.id,
      content: "",
      media: { url: "https://tracker.evil.example/pixel.png", type: "image" },
    });
    await sleep(500);
    const db = await connectDb();
    const stored = await db.collection("directmessages").findOne({ sender: oid(a.id) });
    expect(stored?.media?.url).not.toBe("https://tracker.evil.example/pixel.png");
  });
});

describe("attachments", () => {
  it("accepts an attachment issued by the upload endpoint and derives its type server-side", async () => {
    const a = await createUser();
    const b = await createUser();
    const form = new FormData();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    form.append("media", new Blob([png], { type: "image/png" }), "a.png");
    const up = await api("/messages/upload", { method: "POST", token: a.token, form });

    const sa = await socketFor(a);
    const sent = nextEvent(sa, "messageSent");
    // Client lies about the type; the server should ignore that.
    sa.emit("sendDirectMessage", { receiver: b.id, content: "", media: { url: up.body.url, type: "video" } });
    const msg = await sent;
    expect(msg.media).toEqual({ url: up.body.url, type: "image" });
  });
});

describe("REST direct messages", () => {
  it("SECURITY: POST /messages/send honours blocks the same way the socket path does", async () => {
    const a = await createUser();
    const b = await createUser();
    await api("/user/block", { method: "POST", token: b.token, body: { targetUserId: a.id } });
    const res = await api("/messages/send", { method: "POST", token: a.token, body: { receiverId: b.id, content: "bypass" } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await dmCount(a, b)).toBe(0);
  });

  it("POST /messages/send rejects a receiver that does not exist", async () => {
    const a = await createUser();
    const res = await api("/messages/send", {
      method: "POST",
      token: a.token,
      body: { receiverId: "000000000000000000000000", content: "into the void" },
    });
    expect(res.status).toBe(404);
  });

  it("prevents reading or searching a conversation you are not part of", async () => {
    const a = await createUser();
    const b = await createUser();
    const eve = await createUser();
    await api("/messages/send", { method: "POST", token: a.token, body: { receiverId: b.id, content: "private" } });

    expect((await api(`/messages/conversation/${a.id}/${b.id}`, { token: eve.token })).status).toBe(403);
    expect((await api(`/messages/conversation/${a.id}/${b.id}/search?keyword=priv`, { token: eve.token })).status).toBe(403);
    expect((await api(`/messages/conversation/bad/${b.id}`, { token: a.token })).status).toBe(400);
  });

  it("only the receiver can mark a message seen; only the sender can edit it", async () => {
    const a = await createUser();
    const b = await createUser();
    const eve = await createUser();
    const sent = await api("/messages/send", { method: "POST", token: a.token, body: { receiverId: b.id, content: "x" } });
    const id = sent.body.data._id;

    expect((await api(`/messages/${id}/seen`, { method: "PATCH", token: eve.token })).status).toBe(403);
    expect((await api(`/messages/${id}/seen`, { method: "PATCH", token: b.token })).status).toBe(200);
    expect((await api(`/messages/${id}`, { method: "PATCH", token: b.token, body: { newContent: "forged" } })).status).toBe(403);
    expect((await api(`/messages/${id}`, { method: "PATCH", token: eve.token, body: { newContent: "forged" } })).status).toBe(403);
    expect((await api(`/messages/${id}`, { method: "DELETE", token: eve.token })).status).toBe(403);
    expect((await api(`/messages/${id}`, { method: "PATCH", token: a.token, body: { newContent: "edited" } })).status).toBe(200);
  });

  it("socket markAsRead records readAt like the REST endpoint does", async () => {
    const a = await createUser();
    const b = await createUser();
    const sent = await api("/messages/send", { method: "POST", token: a.token, body: { receiverId: b.id, content: "x" } });
    const sb = await socketFor(b);
    sb.emit("markAsRead", { messageId: sent.body.data._id });
    await sleep(400);
    const db = await connectDb();
    const doc = await db.collection("directmessages").findOne({ _id: oid(sent.body.data._id) });
    expect(doc.status).toBe("read");
    expect(doc.readAt).not.toBeNull();
  });

  it("reports a DM once per reporter, and the admin view populates it from the DirectMessage collection", async () => {
    const a = await createUser();
    const b = await createUser();
    const admin = await createUser({ admin: true });
    const sent = await api("/messages/send", { method: "POST", token: a.token, body: { receiverId: b.id, content: "abusive" } });
    const id = sent.body.data._id;

    expect((await api("/messages/report", { method: "POST", token: b.token, body: { messageId: id, reason: "spam" } })).status).toBe(201);
    expect((await api("/messages/report", { method: "POST", token: b.token, body: { messageId: id, reason: "spam" } })).status).toBe(400);

    const reports = await api("/admin/reports", { token: admin.token });
    const rep = reports.body.reports.find((r) => r.targetMessage?._id === id);
    expect(rep.targetMessage.content).toBe("abusive");

    const resolve = await api("/admin/resolve-report", { method: "POST", token: admin.token, body: { reportId: rep._id, action: "deleteMessage" } });
    expect(resolve.status).toBe(200);
    expect((await api(`/messages/conversation/${a.id}/${b.id}`, { token: b.token })).body.some((m) => m._id === id)).toBe(false);
  });

  it("concurrent duplicate reports from the same user produce a single report", async () => {
    const a = await createUser();
    const b = await createUser();
    const sent = await api("/messages/send", { method: "POST", token: a.token, body: { receiverId: b.id, content: "x" } });
    await Promise.all(
      Array.from({ length: 5 }, () =>
        api("/messages/report", { method: "POST", token: b.token, body: { messageId: sent.body.data._id, reason: "r" } })
      )
    );
    const db = await connectDb();
    expect(await db.collection("reports").countDocuments({ targetMessage: oid(sent.body.data._id) })).toBe(1);
  });
});
