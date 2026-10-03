import { describe, it, expect, afterAll } from "vitest";
import { api, connectDb, createRoom, createUser, teardownClients } from "./helpers/client.js";

afterAll(teardownClients);

const setVisibility = (u, profileVisibility) =>
  api(`/user/settings/${u.id}`, { method: "PATCH", token: u.token, body: { settings: { profileVisibility } } });
const view = (viewer, target) => api(`/user/${target.id}`, { token: viewer.token });

const isFull = (body) => body.profileVisible === true && "bio" in body && "createdAt" in body && body.stats !== undefined;
const isCardOnly = (body) =>
  body.profileVisible === false && !("bio" in body) && !("lastSeen" in body) && !("createdAt" in body) && !("stats" in body);

const owner = async (visibility, bio = "my secret bio") => {
  const u = await createUser();
  await api(`/user/${u.id}`, { method: "PATCH", token: u.token, body: { bio } });
  if (visibility) expect((await setVisibility(u, visibility)).status).toBe(200);
  return u;
};

describe("profile visibility", () => {
  it("defaults to 'connections' for new accounts", async () => {
    const u = await createUser();
    expect((await api(`/user/settings/${u.id}`, { token: u.token })).body.profileVisibility).toBe("connections");
  });

  it("'everyone': any logged-in user sees the full profile, with stats", async () => {
    const target = await owner("everyone");
    const stranger = await createUser();
    const res = await view(stranger, target);
    expect(isFull(res.body)).toBe(true);
    expect(res.body).toMatchObject({ bio: "my secret bio", stats: { roomsJoined: 0, materialsShared: 0 } });
  });

  it("'connections' (default): strangers get only the name card", async () => {
    const target = await owner(undefined);
    const stranger = await createUser();
    const res = await view(stranger, target);
    expect(res.status).toBe(200);
    expect(isCardOnly(res.body)).toBe(true);
    expect(res.body).toMatchObject({ _id: target.id, username: target.username });
    expect(JSON.stringify(res.body)).not.toContain("my secret bio");
  });

  it("'connections': someone sharing a room sees it", async () => {
    const target = await owner("connections");
    const roommate = await createUser();
    const room = await createRoom(target);
    await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: roommate.token });
    expect(isFull((await view(roommate, target)).body)).toBe(true);
  });

  it("'connections': a direct-message partner sees it, in either direction", async () => {
    const target = await owner("connections");
    const partner = await createUser();
    await api("/messages/send", { method: "POST", token: target.token, body: { receiverId: partner.id, content: "hi" } });
    expect(isFull((await view(partner, target)).body)).toBe(true);
  });

  it("'connections': a deleted room or deleted message no longer counts", async () => {
    const target = await owner("connections");
    const other = await createUser();
    const room = await createRoom(target);
    await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: other.token });
    await api(`/chatrooms/delete/${room._id}`, { method: "DELETE", token: target.token });
    const sent = await api("/messages/send", { method: "POST", token: other.token, body: { receiverId: target.id, content: "x" } });
    await api(`/messages/${sent.body.data._id}`, { method: "DELETE", token: other.token });
    expect(isCardOnly((await view(other, target)).body)).toBe(true);
  });

  it("'private': even roommates get only the card", async () => {
    const target = await owner("private");
    const roommate = await createUser();
    const room = await createRoom(target);
    await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: roommate.token });
    expect(isCardOnly((await view(roommate, target)).body)).toBe(true);
  });

  it("the owner and site admins always see everything", async () => {
    const target = await owner("private");
    const admin = await createUser({ admin: true });
    const own = await view(target, target);
    expect(own.body).toMatchObject({ bio: "my secret bio", email: target.email });
    expect((await view(admin, target)).body).toMatchObject({ bio: "my secret bio" });
  });

  it("someone who blocked you looks private, without revealing the block", async () => {
    const target = await owner("everyone");
    const blocked = await createUser();
    await api("/user/block", { method: "POST", token: target.token, body: { targetUserId: blocked.id } });
    const res = await view(blocked, target);
    expect(isCardOnly(res.body)).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/block/i);
  });

  it("never exposes private account fields to other users", async () => {
    const target = await owner("everyone");
    const stranger = await createUser();
    const body = (await view(stranger, target)).body;
    for (const field of ["email", "blockedUsers", "settings", "isAdmin", "isBanned", "tokenVersion", "password", "resetPasswordToken"]) {
      expect(body, field).not.toHaveProperty(field);
    }
  });

  it("rejects an unknown visibility value", async () => {
    const u = await createUser();
    for (const value of ["friends", "", 1, null]) {
      expect((await setVisibility(u, value)).status, String(value)).toBe(400);
    }
    expect((await api(`/user/settings/${u.id}`, { token: u.token })).body.profileVisibility).toBe("connections");
  });

  it("404s for an unknown user and 400s for a malformed id", async () => {
    const u = await createUser();
    expect((await api("/user/000000000000000000000000", { token: u.token })).status).toBe(404);
    expect((await api("/user/not-an-id", { token: u.token })).status).toBe(400);
  });
});

describe("search and lists no longer bypass the setting", () => {
  it("user search returns only name-card fields", async () => {
    const target = await owner("private");
    const searcher = await createUser();
    const hit = (await api(`/user/search?query=${target.username}`, { token: searcher.token })).body.find((u) => u._id === target.id);
    expect(Object.keys(hit).sort()).toEqual(["_id", "displayName", "onlineStatus", "profilePicture", "username"]);
  });

  it("existing accounts without the setting behave as 'connections'", async () => {
    const target = await owner(undefined);
    const db = await connectDb();
    await db.collection("users").updateOne({ email: target.email }, { $unset: { "settings.profileVisibility": "" } });
    const stranger = await createUser();
    expect(isCardOnly((await view(stranger, target)).body)).toBe(true);
  });
});
