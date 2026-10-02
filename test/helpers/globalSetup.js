// Boots the REAL backend (`node src/index.js`, unmodified) as a child process
// against throwaway MongoDB + Redis instances, so every test exercises the
// actual HTTP/Socket.IO surface end-to-end. The server runs with a temp dir
// as its cwd: that keeps uploads out of the repo AND means the developer's
// own .env is never loaded (dotenv reads .env from cwd).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { MongoMemoryServer } from "mongodb-memory-server";
import { RedisMemoryServer } from "redis-memory-server";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });

const waitForHealthy = async (baseUrl, child, timeoutMs = 60_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited early with code ${child.exitCode}`);
    try {
      const res = await fetch(`${baseUrl}/health`);
      const body = await res.json();
      if (res.status === 200 && body.redis === "up") return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Server did not become healthy in time");
};

export default async function setup({ provide }) {
  const mongo = await MongoMemoryServer.create();
  const redis = await RedisMemoryServer.create();
  const redisHost = await redis.getHost();
  const redisPort = await redis.getPort();

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "studysync-e2e-"));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const mongoUri = `${mongo.getUri()}studysync-test`;

  const logFile = path.join(workDir, "server.log");
  const logStream = fs.createWriteStream(logFile);

  const child = spawn(process.execPath, [path.join(backendRoot, "src/index.js")], {
    cwd: workDir,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      LOG_LEVEL: process.env.TEST_SERVER_LOG_LEVEL || "info",
      PORT: String(port),
      BASE_URL: baseUrl,
      FRONTEND_URL: "http://localhost:5173",
      MONGO_URI: mongoUri,
      REDIS_HOST: redisHost,
      REDIS_PORT: String(redisPort),
      REDIS_PASSWORD: "",
      JWT_SECRET: "test-access-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
      JWT_RESET_SECRET: "test-reset-secret",
      // Unreachable SMTP: email jobs fail fast in the worker instead of
      // ever reaching a real mail provider.
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1",
      POSTMARK_API_KEY: "test",
      EMAIL_FROM: "no-reply@test.local",
      GOOGLE_CLIENT_ID: "test",
      GOOGLE_CLIENT_SECRET: "test",
      GOOGLE_CALLBACK_URL: `${baseUrl}/api/auth/google/callback`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(logStream);
  child.stderr.pipe(logStream);

  try {
    await waitForHealthy(baseUrl, child);
  } catch (err) {
    child.kill("SIGKILL");
    throw new Error(`${err.message}\n--- server log ---\n${fs.readFileSync(logFile, "utf8").slice(-4000)}`);
  }

  provide("baseUrl", baseUrl);
  provide("mongoUri", mongoUri);
  provide("redisHost", redisHost);
  provide("redisPort", redisPort);
  provide("uploadsDir", path.join(workDir, "uploads"));
  provide("serverLog", logFile);

  return async () => {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    if (child.exitCode === null) child.kill("SIGKILL");
    await redis.stop();
    await mongo.stop();
    if (!process.env.KEEP_TEST_WORKDIR) fs.rmSync(workDir, { recursive: true, force: true });
  };
}
