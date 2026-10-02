import { describe, it, expect, afterAll } from "vitest";
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
  getRedis,
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

const roomDoc = async (roomId) => (await connectDb()).collection("chatrooms").findOne({ _id: oid(roomId) });

describe("room lifecycle (REST)", () => {
  it("creates a room with the creator as sole member and admin, and logs activity", async () => {
    const owner = await createUser();
    const room = await createRoom(owner, { subject: "math", tags: ["a"] });
    expect(room.members).toEqual([owner.id]);
    expect(room.admins).toEqual([owner.id]);
    expect(room.createdBy).toBe(owner.id);

    const activity = await api("/activity", { token: owner.token });
    expect(activity.body[0]).toMatchObject({ type: "room_created" });
  });

  it("rejects a non-positive maxParticipants and a missing name", async () => {
    const owner = await createUser();
    expect((await api("/chatrooms/create", { method: "POST", token: owner.token, body: { name: "x", maxParticipants: 0 } })).status).toBe(400);
    expect((await api("/chatrooms/create", { method: "POST", token: owner.token, body: { name: "x", maxParticipants: "abc" } })).status).toBe(400);
    expect((await api("/chatrooms/create", { method: "POST", token: owner.token, body: {} })).status).toBe(400);
  });

  it("joins a public room idempotently and enforces capacity", async () => {
    const owner = await createUser();
    const room = await createRoom(owner, { maxParticipants: 2 });
    const a = await createUser();
    const b = await createUser();

    expect((await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: a.token })).status).toBe(200);
    expect((await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: a.token })).status).toBe(200);
    expect((await roomDoc(room._id)).members).toHaveLength(2);
    expect((await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: b.token })).status).toBe(409);
  });

  it("returns 4xx (not 500) for malformed room ids", async () => {
    const u = await createUser();
    const res = await api("/chatrooms/not-an-id", { token: u.token });
    expect(res.status).toBe(400);
  });

  it("only room admins (or site admins) can update or delete a room", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const member = await createUser();
    const siteAdmin = await createUser({ admin: true });
    await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: member.token });

    expect((await api(`/chatrooms/${room._id}`, { method: "PATCH", token: member.token, body: { name: "hijack" } })).status).toBe(403);
    expect((await api(`/chatrooms/delete/${room._id}`, { method: "DELETE", token: member.token })).status).toBe(403);
    expect((await api(`/chatrooms/${room._id}`, { method: "PATCH", token: owner.token, body: { name: "renamed" } })).status).toBe(200);
    expect((await api(`/chatrooms/delete/${room._id}`, { method: "DELETE", token: siteAdmin.token })).status).toBe(200);
    expect((await api(`/chatrooms/${room._id}`, { token: owner.token })).status).toBe(404);
  });

  it("does not let maxParticipants be lowered below the current member count", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const m = await createUser();
    await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: m.token });
    const res = await api(`/chatrooms/${room._id}`, { method: "PATCH", token: owner.token, body: { maxParticipants: 1 } });
    expect(res.status).toBe(400);
  });

  it("answers a non-string room name on update with a 4xx, not a 500", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const res = await api(`/chatrooms/${room._id}`, { method: "PATCH", token: owner.token, body: { name: 123 } });
    expect(res.status).toBeLessThan(500);
  });

  it("a deleted room's messages are no longer readable", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    await api(`/chatrooms/${room._id}/send`, { method: "POST", token: owner.token, body: { content: "secret" } });
    await api(`/chatrooms/delete/${room._id}`, { method: "DELETE", token: owner.token });
    const res = await api(`/chatrooms/${room._id}/messages`, { token: owner.token });
    expect(res.status).toBe(404);
  });
});

describe("private rooms", () => {
  it("hides a private room from non-invited users and lets invited users join", async () => {
    const owner = await createUser();
    const room = await createRoom(owner, { type: "private" });
    const outsider = await createUser();
    const invitee = await createUser();

    expect((await api(`/chatrooms/${room._id}`, { token: outsider.token })).status).toBe(403);
    expect((await api(`/chatrooms/${room._id}/messages`, { token: outsider.token })).status).toBe(403);
    expect((await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: outsider.token })).status).toBe(404);
    expect((await api(`/chatrooms/join-private/${room._id}`, { method: "POST", token: outsider.token })).status).toBe(403);
    expect((await api("/chatrooms/all")).body.some((r) => r._id === room._id)).toBe(false);

    expect((await api(`/chatrooms/invite/${room._id}`, { method: "POST", token: outsider.token, body: { userIds: [outsider.id] } })).status).toBe(403);
    expect((await api(`/chatrooms/invite/${room._id}`, { method: "POST", token: owner.token, body: { userIds: [invitee.id] } })).status).toBe(200);
    expect((await api(`/chatrooms/join-private/${room._id}`, { method: "POST", token: invitee.token })).status).toBe(200);
    expect((await roomDoc(room._id)).members.map(String)).toContain(invitee.id);
  });

  it("the creator of a private room can open it over the socket (joinRoom)", async () => {
    // RoomDetail.jsx always emits joinRoom when a room page is opened.
    const owner = await createUser();
    const room = await createRoom(owner, { type: "private" });
    const s = await socketFor(owner);
    const unauthorized = nextEvent(s, "unauthorized");
    const previous = nextEvent(s, "previousMessages");
    s.emit("joinRoom", { roomId: room._id });
    expect(await unauthorized).toBeUndefined();
    expect(await previous).toEqual([]);
  });

  it("SECURITY: room-invite emails escape the (user-controlled) room name", async () => {
    const owner = await createUser();
    const invitee = await createUser();
    const name = `<a href="https://evil.example/login">Click to verify your account</a>`;
    const room = await createRoom(owner, { type: "private", name });
    await api(`/chatrooms/invite/${room._id}`, { method: "POST", token: owner.token, body: { userIds: [invitee.id] } });

    const redis = getRedis();
    const id = await redis.get("bull:email:id");
    const job = await redis.hgetall(`bull:email:${id}`);
    expect(job.name).toBe("room-invite");
    expect(JSON.parse(job.data).html).not.toContain('<a href="https://evil.example');
  });
});

describe("leaving and admin roles", () => {
  it("REST leave removes membership and admin rights", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const m = await createUser();
    await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: m.token });
    await api("/admin/promote", { method: "PATCH", token: owner.token, body: { roomId: room._id, userId: m.id } });

    await api("/chatrooms/leave", { method: "POST", token: m.token, body: { roomId: room._id } });
    const doc = await roomDoc(room._id);
    expect(doc.members.map(String)).not.toContain(m.id);
    expect(doc.admins.map(String)).not.toContain(m.id);
  });

  it("socket leaveRoom also revokes room-admin rights", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const m = await createUser();
    await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: m.token });
    await api("/admin/promote", { method: "PATCH", token: owner.token, body: { roomId: room._id, userId: m.id } });

    const s = await socketFor(m);
    s.emit("leaveRoom", { roomId: room._id });
    await sleep(400);

    expect((await roomDoc(room._id)).members.map(String)).not.toContain(m.id);
    // A user who left must not still be able to administer the room.
    const edit = await api(`/chatrooms/${room._id}`, { method: "PATCH", token: m.token, body: { name: "still admin" } });
    expect(edit.status).toBe(403);
  });

  it("the last admin leaving does not leave the room with zero admins", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const m = await createUser();
    await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: m.token });
    await api("/chatrooms/leave", { method: "POST", token: owner.token, body: { roomId: room._id } });
    const doc = await roomDoc(room._id);
    // Demote explicitly refuses to remove the last admin; leaving should not
    // be a back door to the same orphaned state.
    expect(doc.admins.map(String)).toEqual([m.id]);
  });

  it("promote/demote require room-admin and refuse to demote the last admin", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const m = await createUser();
    await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: m.token });

    expect((await api("/admin/promote", { method: "PATCH", token: m.token, body: { roomId: room._id, userId: m.id } })).status).toBe(403);
    expect((await api("/admin/demote", { method: "PATCH", token: owner.token, body: { roomId: room._id, userId: owner.id } })).status).toBe(400);
    const outsider = await createUser();
    expect((await api("/admin/promote", { method: "PATCH", token: owner.token, body: { roomId: room._id, userId: outsider.id } })).status).toBe(400);
  });
});

describe("room messages", () => {
  it("delivers a socket room message to members (persisted), and not to non-members", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const member = await createUser();
    const outsider = await createUser();
    await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: member.token });

    const [so, sm, sx] = await Promise.all([socketFor(owner), socketFor(member), socketFor(outsider)]);
    const gotMember = nextEvent(sm, "receiveMessage");
    const gotEcho = nextEvent(so, "receiveMessage");
    const gotOutsider = nextEvent(sx, "receiveMessage");
    const notif = nextEvent(sm, "newNotification");
    so.emit("sendPrivateMessage", { roomId: room._id, content: "hi 👋" });

    const msg = await gotMember;
    expect(msg.content).toBe("hi 👋");
    expect(msg.emojis).toEqual(["👋"]);
    expect(msg.sender.username).toBe(owner.username);
    expect((await gotEcho)._id).toBe(msg._id);
    expect(await gotOutsider).toBeUndefined();
    expect((await notif).type).toBe("room_message");

    const hist = await api(`/chatrooms/${room._id}/messages`, { token: member.token });
    expect(hist.body.map((m) => m._id)).toContain(msg._id);
  });

  it("rejects socket room messages from non-members and blank content", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const outsider = await createUser();
    const sx = await socketFor(outsider);
    const err = nextEvent(sx, "error");
    sx.emit("sendPrivateMessage", { roomId: room._id, content: "spam" });
    expect((await err).message).toMatch(/not a member/);

    const so = await socketFor(owner);
    const err2 = nextEvent(so, "error");
    so.emit("sendPrivateMessage", { roomId: room._id, content: "   " });
    expect((await err2).message).toMatch(/Invalid/);
  });

  it("does not deliver room messages to a member who blocked the sender, and hides them in history", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const blocker = await createUser();
    await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: blocker.token });
    await api("/user/block", { method: "POST", token: blocker.token, body: { targetUserId: owner.id } });

    const [so, sb] = await Promise.all([socketFor(owner), socketFor(blocker)]);
    const got = nextEvent(sb, "receiveMessage");
    so.emit("sendPrivateMessage", { roomId: room._id, content: "you blocked me" });
    expect(await got).toBeUndefined();

    const hist = await api(`/chatrooms/${room._id}/messages`, { token: blocker.token });
    expect(hist.body.some((m) => m.content === "you blocked me")).toBe(false);
    const search = await api(`/chatrooms/${room._id}/search?keyword=blocked`, { token: blocker.token });
    expect(search.body.some((m) => m.content === "you blocked me")).toBe(false);
  });

  it("only the sender can edit; sender, room admin, or site admin can delete", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const m = await createUser();
    await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: m.token });
    const sent = await api(`/chatrooms/${room._id}/send`, { method: "POST", token: m.token, body: { content: "orig" } });
    const id = sent.body._id;

    expect((await api(`/chatrooms/messages/${id}`, { method: "PATCH", token: owner.token, body: { newContent: "x" } })).status).toBe(403);
    expect((await api(`/chatrooms/messages/${id}`, { method: "PATCH", token: m.token, body: { newContent: "edited" } })).status).toBe(200);
    expect((await api(`/chatrooms/${room._id}/messages/${id}`, { method: "DELETE", token: owner.token })).status).toBe(200);
    const hist = await api(`/chatrooms/${room._id}/messages`, { token: m.token });
    expect(hist.body.some((x) => x._id === id)).toBe(false);
  });

  it("rejects an edit that blanks a message's content", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const sent = await api(`/chatrooms/${room._id}/send`, { method: "POST", token: owner.token, body: { content: "orig" } });
    const res = await api(`/chatrooms/messages/${sent.body._id}`, { method: "PATCH", token: owner.token, body: {} });
    expect(res.status).toBe(400);
  });

  it("rejects an empty REST room message", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const res = await api(`/chatrooms/${room._id}/send`, { method: "POST", token: owner.token, body: { content: "" } });
    expect(res.status).toBe(400);
  });
});

describe("socket room-presence leaks", () => {
  it("SECURITY: a non-member cannot list who is currently inside a private room", async () => {
    const owner = await createUser();
    const room = await createRoom(owner, { type: "private" });
    const invitee = await createUser();
    await api(`/chatrooms/invite/${room._id}`, { method: "POST", token: owner.token, body: { userIds: [invitee.id] } });
    const si = await socketFor(invitee);
    si.emit("joinRoom", { roomId: room._id });
    await nextEvent(si, "previousMessages");

    const outsider = await createUser();
    const sx = await socketFor(outsider);
    const result = await new Promise((resolve) => sx.emit("getRoomParticipants", room._id, resolve));
    const leaked = (result.participants || []).map((p) => p._id);
    expect(leaked).not.toContain(invitee.id);
  });

  it("SECURITY: a non-member cannot push typing indicators into a room", async () => {
    const owner = await createUser();
    const room = await createRoom(owner, { type: "private" });
    const so = await socketFor(owner);
    const outsider = await createUser();
    const sx = await socketFor(outsider);
    const typing = nextEvent(so, "typing");
    sx.emit("typing", { roomId: room._id, isDirect: false });
    expect(await typing).toBeUndefined();
  });
});

describe("capacity & membership under concurrency", () => {
  it("concurrent public joins never exceed maxParticipants", async () => {
    // Interleaving is timing-dependent, so one clean trial proves little.
    const memberCounts = [];
    for (let trial = 0; trial < 4; trial++) {
      const owner = await createUser();
      const room = await createRoom(owner, { maxParticipants: 3 });
      const users = await Promise.all(Array.from({ length: 8 }, () => createUser()));
      await Promise.all(users.map((u) => api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: u.token })));
      memberCounts.push((await roomDoc(room._id)).members.length);
    }
    expect(Math.max(...memberCounts), `member counts per trial (max 3): ${memberCounts}`).toBeLessThanOrEqual(3);
  }, 60_000);

  it("the same user double-submitting a join is recorded once", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const u = await createUser();
    await Promise.all(
      Array.from({ length: 5 }, () => api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: u.token }))
    );
    const ids = (await roomDoc(room._id)).members.map(String);
    expect(ids.filter((id) => id === u.id)).toHaveLength(1);
  });

  it("a join racing with a leave does not lose the joiner's membership", async () => {
    let lost = 0;
    for (let trial = 0; trial < 5; trial++) {
      const owner = await createUser();
      const room = await createRoom(owner);
      const leaver = await createUser();
      const joiner = await createUser();
      await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: leaver.token });
      await Promise.all([
        api("/chatrooms/leave", { method: "POST", token: leaver.token, body: { roomId: room._id } }),
        api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: joiner.token }),
      ]);
      const ids = (await roomDoc(room._id)).members.map(String);
      if (!ids.includes(joiner.id)) lost++;
    }
    expect(lost, "trials where a successful join was silently overwritten").toBe(0);
  });

  it("socket joinRoom respects maxParticipants like the REST join does", async () => {
    const owner = await createUser();
    const room = await createRoom(owner, { maxParticipants: 1 }); // full: owner only
    const u = await createUser();
    expect((await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: u.token })).status).toBe(409);

    const s = await socketFor(u);
    s.emit("joinRoom", { roomId: room._id });
    await sleep(500);
    expect((await roomDoc(room._id)).members.map(String)).not.toContain(u.id);
  });
});

describe("study-session tracking", () => {
  it("joinRoom twice on one socket does not leave a session open forever", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const s = await socketFor(owner);
    s.emit("joinRoom", { roomId: room._id });
    await nextEvent(s, "previousMessages");
    s.emit("joinRoom", { roomId: room._id }); // e.g. React StrictMode double effect / re-render
    await nextEvent(s, "previousMessages");
    s.close();
    await sleep(500);

    const db = await connectDb();
    const open = await db.collection("roomsessions").countDocuments({ user: oid(owner.id), leftAt: null });
    expect(open).toBe(0);
  });

  it("opens a session on joinRoom and closes it with a duration on exitRoomView", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const s = await socketFor(owner);
    s.emit("joinRoom", { roomId: room._id });
    await nextEvent(s, "previousMessages");
    await sleep(1100);
    s.emit("exitRoomView", { roomId: room._id });
    await sleep(300);
    const db = await connectDb();
    const session = await db.collection("roomsessions").findOne({ user: oid(owner.id) });
    expect(session.leftAt).not.toBeNull();
    expect(session.durationSeconds).toBeGreaterThanOrEqual(1);
  });
});
