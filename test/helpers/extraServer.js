// Starts a SECOND instance of the real server against the same MongoDB and
// Redis as the main test server - for testing behaviour across instances
// (Socket.IO Redis adapter, shared rate limits, cluster-wide presence).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { inject } from "vitest";

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

export const startExtraServer = async () => {
  const port = await freePort();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "studysync-e2e-b-"));
  const mainBase = inject("baseUrl");
  const entry = path.join(backendRoot, process.env.TEST_SERVER_ENTRY || "src/index.js");
  const child = spawn(process.execPath, ["--enable-source-maps", entry], {
    cwd: workDir,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "test",
      LOG_LEVEL: "warn",
      PORT: String(port),
      // Same public base URL as the main instance: they serve one "site".
      BASE_URL: mainBase,
      FRONTEND_URL: "http://localhost:5173",
      MONGO_URI: inject("mongoUri"),
      REDIS_HOST: inject("redisHost"),
      REDIS_PORT: String(inject("redisPort")),
      REDIS_PASSWORD: "",
      JWT_SECRET: "test-access-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1",
      GOOGLE_CLIENT_ID: "test",
      GOOGLE_CLIENT_SECRET: "test",
      GOOGLE_CALLBACK_URL: `${mainBase}/api/auth/google/callback`,
      REFRESH_REUSE_GRACE_SECONDS: "2",
    },
    stdio: "ignore",
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.status === 200 && (await res.json()).redis === "up") break;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return {
    baseUrl,
    stop: async () => {
      child.kill("SIGTERM");
      await new Promise((r) => setTimeout(r, 300));
      if (child.exitCode === null) child.kill("SIGKILL");
      fs.rmSync(workDir, { recursive: true, force: true });
    },
  };
};
