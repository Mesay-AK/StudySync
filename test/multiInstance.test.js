// Two real server instances sharing MongoDB + Redis, as behind a load
// balancer. Everything here used to be tested against a single process only.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ioClient } from "socket.io-client";
import { api, baseUrl, clearRateLimits, createUser, nextEvent, sleep, teardownClients } from "./helpers/client.js";
import { startExtraServer } from "./helpers/extraServer.js";

let second;
const sockets = [];
beforeAll(async () => { second = await startExtraServer(); }, 90_000);
afterAll(async () => {
  sockets.forEach((s) => s.close());
  await second?.stop();
  await teardownClients();
});

const connectTo = (url, token) =>
  new Promise((resolve, reject) => {
    const s = ioClient(url, { auth: { token }, transports: ["websocket"], reconnection: false, forceNew: true });
    s.once("connect", () => { sockets.push(s); resolve(s); });
    s.once("connect_error", reject);
  });

const apiOn = async (url, path, { method = "GET", token, body } = {}) => {
  const res = await fetch(`${url}/api${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => undefined) };
};

describe("across two server instances", () => {
  it("delivers a DM live from a sender on instance A to a receiver on instance B, marked delivered", async () => {
    const a = await createUser();
    const b = await createUser();
    const sa = await connectTo(baseUrl(), a.token);
    const sb = await connectTo(second.baseUrl, b.token);

    const got = nextEvent(sb, "receiveDirectMessage", 3000);
    const sent = nextEvent(sa, "messageSent", 3000);
    sa.emit("sendDirectMessage", { receiver: b.id, content: "across instances" });
    expect((await got)?.content).toBe("across instances");
    expect((await sent)?.status).toBe("delivered");
  });

  it("reports a user online on instance A while they're only connected to instance B", async () => {
    const viewer = await createUser();
    const b = await createUser();
    await connectTo(second.baseUrl, b.token);
    const res = await api(`/user/${b.id}/status`, { token: viewer.token });
    expect(res.body.onlineStatus).toBe("online");
  });

  it("shares the login rate limit across instances (no multiplying it by instance count)", async () => {
    await clearRateLimits();
    const statuses = [];
    for (let i = 0; i < 21; i++) {
      const target = i % 2 === 0 ? baseUrl() : second.baseUrl;
      statuses.push((await apiOn(target, "/auth/login", { method: "POST", body: { email: "x@y.z", password: "x" } })).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 401), `statuses ${statuses}`).toBe(true);
    expect(statuses[20]).toBe(429);
    await clearRateLimits();
  });

  it("banning a user through instance A disconnects their socket on instance B", async () => {
    const admin = await createUser({ admin: true });
    const victim = await createUser();
    const s = await connectTo(second.baseUrl, victim.token);
    const disconnected = new Promise((r) => s.once("disconnect", r));
    await api("/admin/toggle-user", { method: "POST", token: admin.token, body: { userId: victim.id, ban: true } });
    const reason = await Promise.race([disconnected, sleep(3000).then(() => "still connected")]);
    expect(reason).toBe("io server disconnect");
  });

  it("a refresh token issued by one instance rotates on the other", async () => {
    const u = await createUser();
    const res = await fetch(`${second.baseUrl}/api/auth/refresh`, { method: "POST", headers: { Cookie: u.cookie } });
    expect(res.status).toBe(200);
  });
});
