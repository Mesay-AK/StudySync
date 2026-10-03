// Endpoints/events the frontend relies on for invitations, read receipts
// and bulk notification updates.
import { describe, it, expect, afterAll } from "vitest";
import {
  api,
  createUser,
  createRoom,
  connectSocket,
  nextEvent,
  getRedis,
  sleep,
  teardownClients,
} from "./helpers/client.js";

const sockets = [];
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await teardownClients();
});

describe("GET /chatrooms/invited", () => {
  it("lists private rooms I'm invited to but haven't joined, without exposing the invite list", async () => {
    const owner = await createUser();
    const me = await createUser();
    const room = await createRoom(owner, { type: "private" });
    await api(`/chatrooms/invite/${room._id}`, { method: "POST", token: owner.token, body: { userIds: [me.id] } });

    const res = await api("/chatrooms/invited", { token: me.token });
    expect(res.status).toBe(200);
    const hit = res.body.find((r) => r._id === room._id);
    expect(hit).toBeTruthy();
    expect(hit.invitedUsers).toBeUndefined();
  });

  it("drops a room once I've joined it", async () => {
    const owner = await createUser();
    const me = await createUser();
    const room = await createRoom(owner, { type: "private" });
    await api(`/chatrooms/invite/${room._id}`, { method: "POST", token: owner.token, body: { userIds: [me.id] } });
    await api(`/chatrooms/join-private/${room._id}`, { method: "POST", token: me.token });

    const res = await api("/chatrooms/invited", { token: me.token });
    expect(res.body.some((r) => r._id === room._id)).toBe(false);
  });

  it("excludes deleted rooms and rooms I wasn't invited to", async () => {
    const owner = await createUser();
    const me = await createUser();
    const deleted = await createRoom(owner, { type: "private" });
    const other = await createRoom(owner, { type: "private" });
    await api(`/chatrooms/invite/${deleted._id}`, { method: "POST", token: owner.token, body: { userIds: [me.id] } });
    await api(`/chatrooms/delete/${deleted._id}`, { method: "DELETE", token: owner.token });

    const ids = (await api("/chatrooms/invited", { token: me.token })).body.map((r) => r._id);
    expect(ids).not.toContain(deleted._id);
    expect(ids).not.toContain(other._id);
  });

  it("requires authentication", async () => {
    expect((await api("/chatrooms/invited")).status).toBe(401);
  });

  it("is not swallowed by the /:roomId route", async () => {
    const me = await createUser();
    const res = await api("/chatrooms/invited", { token: me.token });
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("room invitations", () => {
  it("flags an invitee with isInvited on the room, and members/outsiders without it", async () => {
    const owner = await createUser();
    const me = await createUser();
    const room = await createRoom(owner, { type: "private" });
    await api(`/chatrooms/invite/${room._id}`, { method: "POST", token: owner.token, body: { userIds: [me.id] } });

    const asInvitee = await api(`/chatrooms/${room._id}`, { token: me.token });
    expect(asInvitee.body).toMatchObject({ isMember: false, isInvited: true });
    const asOwner = await api(`/chatrooms/${room._id}`, { token: owner.token });
    expect(asOwner.body).toMatchObject({ isMember: true, isInvited: false });
  });

  it("puts a link to the room in the invite email", async () => {
    const owner = await createUser();
    const me = await createUser();
    const room = await createRoom(owner, { type: "private" });
    await api(`/chatrooms/invite/${room._id}`, { method: "POST", token: owner.token, body: { userIds: [me.id] } });

    const redis = getRedis();
    const job = await redis.hgetall(`bull:email:${await redis.get("bull:email:id")}`);
    expect(JSON.parse(job.data).html).toContain(`http://localhost:5173/user/room/${room._id}`);
  });

  it("does not re-send or duplicate an invite for someone already invited", async () => {
    const owner = await createUser();
    const me = await createUser();
    const room = await createRoom(owner, { type: "private" });
    await api(`/chatrooms/invite/${room._id}`, { method: "POST", token: owner.token, body: { userIds: [me.id] } });
    const redis = getRedis();
    const before = await redis.get("bull:email:id");
    const again = await api(`/chatrooms/invite/${room._id}`, { method: "POST", token: owner.token, body: { userIds: [me.id, me.id] } });
    expect(again.status).toBe(200);
    expect(await redis.get("bull:email:id")).toBe(before);
    expect(again.body.room.invitedUsers.filter((id) => id === me.id)).toHaveLength(1);
  });

  it("rejects malformed invite payloads", async () => {
    const owner = await createUser();
    const room = await createRoom(owner, { type: "private" });
    for (const body of [{}, { userIds: "x" }, { userIds: ["not-an-id"] }, { userIds: [{ a: 1 }] }]) {
      const res = await api(`/chatrooms/invite/${room._id}`, { method: "POST", token: owner.token, body });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe("read receipts over REST", () => {
  it("tells the sender, live, when the receiver opens the conversation", async () => {
    const sender = await createUser();
    const reader = await createUser();
    await api("/messages/send", { method: "POST", token: sender.token, body: { receiverId: reader.id, content: "hi" } });
    const ss = await connectSocket(sender.token);
    sockets.push(ss);

    const read = nextEvent(ss, "conversationRead");
    await api(`/messages/conversation/${sender.id}/seen`, { method: "PATCH", token: reader.token });
    expect(await read).toEqual({ readerId: reader.id });
  });

  it("stays quiet when there was nothing unread", async () => {
    const sender = await createUser();
    const reader = await createUser();
    const ss = await connectSocket(sender.token);
    sockets.push(ss);
    const read = nextEvent(ss, "conversationRead", 600);
    await api(`/messages/conversation/${sender.id}/seen`, { method: "PATCH", token: reader.token });
    expect(await read).toBeUndefined();
  });

  it("socket markAsRead tells the sender which message was read", async () => {
    const sender = await createUser();
    const reader = await createUser();
    const sent = await api("/messages/send", { method: "POST", token: sender.token, body: { receiverId: reader.id, content: "hi" } });
    const [ss, sr] = await Promise.all([connectSocket(sender.token), connectSocket(reader.token)]);
    sockets.push(ss, sr);
    const read = nextEvent(ss, "messageRead");
    sr.emit("markAsRead", { messageId: sent.body.data._id });
    expect(await read).toEqual({ messageId: sent.body.data._id });
  });
});

describe("PATCH /notifications/read-all", () => {
  const makeNotifications = async (n) => {
    const from = await createUser();
    const to = await createUser();
    const s = await connectSocket(from.token);
    sockets.push(s);
    for (let i = 0; i < n; i++) s.emit("sendDirectMessage", { receiver: to.id, content: `m${i}` });
    await sleep(600);
    return { from, to };
  };

  it("marks every unread notification of mine read in one call", async () => {
    const { to } = await makeNotifications(3);
    expect((await api("/notifications", { token: to.token })).body.filter((n) => !n.isRead)).toHaveLength(3);

    const res = await api("/notifications/read-all", { method: "PATCH", token: to.token });
    expect(res.body.updatedCount).toBe(3);
    expect((await api("/notifications", { token: to.token })).body.every((n) => n.isRead)).toBe(true);
  });

  it("does not touch other users' notifications", async () => {
    const { to } = await makeNotifications(2);
    const stranger = await createUser();
    await api("/notifications/read-all", { method: "PATCH", token: stranger.token });
    expect((await api("/notifications", { token: to.token })).body.filter((n) => !n.isRead)).toHaveLength(2);
  });

  it("is idempotent", async () => {
    const { to } = await makeNotifications(1);
    await api("/notifications/read-all", { method: "PATCH", token: to.token });
    const again = await api("/notifications/read-all", { method: "PATCH", token: to.token });
    expect(again.status).toBe(200);
    expect(again.body.updatedCount).toBe(0);
  });

  it("does not let one user mark another user's notification read by id", async () => {
    const { to } = await makeNotifications(1);
    const stranger = await createUser();
    const [notif] = (await api("/notifications", { token: to.token })).body;
    expect((await api(`/notifications/${notif._id}/read`, { method: "PATCH", token: stranger.token })).status).toBe(404);
  });
});
