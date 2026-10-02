import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import { api, baseUrl, createUser, connectSocket, clearRateLimits, sleep, teardownClients } from "./helpers/client.js";

afterAll(teardownClients);

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

const serverAlive = async () => {
  try {
    return (await fetch(`${baseUrl()}/health`)).status === 200;
  } catch {
    return false;
  }
};

describe("socket payload robustness", () => {
  // Any authenticated client can send any payload shape. A malformed one must
  // be rejected for that socket only - never take down the whole process.
  const events = [
    "typing",
    "stopTyping",
    "joinRoom",
    "exitRoomView",
    "leaveRoom",
    "sendDirectMessage",
    "markAsRead",
    "sendPrivateMessage",
    "getRoomMessages",
    "getDirectMessages",
    "getRoomParticipants",
  ];

  for (const event of events) {
    it(`survives "${event}" sent with no payload / a null payload`, async () => {
      const u = await createUser();
      const s = await connectSocket(u.token);
      s.emit(event);
      s.emit(event, null);
      await sleep(400);
      s.close();
      expect(await serverAlive(), `server died after a bare "${event}" event`).toBe(true);
    });
  }
});

describe("rate limiters", () => {
  it("upload traffic does not consume the login rate-limit budget", async () => {
    const u = await createUser(); // clears counters
    for (let i = 0; i < 21; i++) {
      const form = new FormData();
      form.append("media", new Blob([PNG], { type: "image/png" }), "a.png");
      await api("/messages/upload", { method: "POST", token: u.token, form });
    }
    const login = await api("/auth/login", { method: "POST", body: { email: u.email, password: u.password } });
    expect(login.status).toBe(200);
    await clearRateLimits();
  });

  it("ordinary session checks (/auth/me) are not throttled like login attempts", async () => {
    const u = await createUser();
    const statuses = [];
    for (let i = 0; i < 25; i++) statuses.push((await api("/auth/me", { token: u.token })).status);
    expect(statuses.every((s) => s === 200), `statuses: ${statuses}`).toBe(true);
    await clearRateLimits();
  });
});

void fs;
