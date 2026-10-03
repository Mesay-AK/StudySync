import { inject } from "vitest";
import mongoose from "mongoose";
import Redis from "ioredis";
import { io as ioClient } from "socket.io-client";
import { randomUUID } from "node:crypto";

export const baseUrl = () => inject("baseUrl");

export const STRONG_PASSWORD = "Str0ng!Pass";

// Minimal fetch wrapper: JSON in/out, bearer auth, raw cookies. Returns the
// parsed body plus status/headers so tests can assert on all three.
export const api = async (path, { method = "GET", token, body, cookie, headers = {}, form } = {}) => {
  const init = { method, headers: { ...headers } };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (cookie) init.headers.Cookie = cookie;
  if (form) {
    init.body = form;
  } else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl()}/api${path}`, init);
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed, headers: res.headers };
};

// Collapses Set-Cookie headers into a Cookie request header value.
export const cookiesFrom = (headers) =>
  headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => !c.endsWith("="))
    .join("; ");

export const cookieValue = (cookieHeader, name) =>
  cookieHeader
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);

let redis;
export const getRedis = () => {
  if (!redis) redis = new Redis({ host: inject("redisHost"), port: inject("redisPort") });
  return redis;
};

// Every test file logs in many users from the same IP; the /api/auth limiter
// (20 per 15 min, Redis-backed) would otherwise trip across unrelated tests.
// Only the rate-limit test itself exercises the limiter deliberately.
export const clearRateLimits = async () => {
  const r = getRedis();
  const keys = await r.keys("rl:*");
  if (keys.length) await r.del(...keys);
};

export const connectDb = async () => {
  if (mongoose.connection.readyState !== 1) await mongoose.connect(inject("mongoUri"));
  return mongoose.connection.db;
};

export const oid = (id) => new mongoose.Types.ObjectId(String(id));

export const uniq = (prefix = "u") => `${prefix}${randomUUID().slice(0, 8)}`;

// Registers + logs in a fresh user through the real API. `admin: true` /
// `superAdmin: true` flip the role flags directly in the DB (there is no public way to bootstrap the first
// admin - /admin/adRegister itself requires an admin).
export const createUser = async ({ admin = false, superAdmin = false, password = STRONG_PASSWORD } = {}) => {
  await clearRateLimits();
  const username = uniq("user");
  const email = `${username}@example.test`;
  const reg = await api("/auth/register", { method: "POST", body: { username, email, password } });
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);

  if (admin || superAdmin) {
    const db = await connectDb();
    await db.collection("users").updateOne({ email }, { $set: { isAdmin: true, isSuperAdmin: superAdmin } });
  }

  const login = await api("/auth/login", { method: "POST", body: { email, password } });
  if (login.status !== 200) throw new Error(`login failed: ${login.status} ${JSON.stringify(login.body)}`);

  return {
    id: String(login.body.userId),
    token: login.body.token,
    cookie: cookiesFrom(login.headers),
    username,
    email,
    password,
  };
};

export const connectSocket = (token) =>
  new Promise((resolve, reject) => {
    const socket = ioClient(baseUrl(), {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
    });
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", (err) => {
      socket.close();
      reject(err);
    });
  });

// Resolves with the first payload of `event`, or `undefined` after timeoutMs -
// lets tests assert both "this arrived" and "this never arrived".
export const nextEvent = (socket, event, timeoutMs = 1500) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(undefined);
    }, timeoutMs);
    const handler = (payload) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const createRoom = async (owner, overrides = {}) => {
  const res = await api("/chatrooms/create", {
    method: "POST",
    token: owner.token,
    body: { name: uniq("room"), type: "public", ...overrides },
  });
  if (res.status !== 201) throw new Error(`createRoom failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
};

export const teardownClients = async () => {
  if (redis) {
    await redis.quit();
    redis = undefined;
  }
  if (mongoose.connection.readyState === 1) await mongoose.disconnect();
};
