import { describe, it, expect, afterAll, inject } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { api, baseUrl, createUser, connectDb, oid, teardownClients } from "./helpers/client.js";

afterAll(teardownClients);

// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

const fileForm = (field, bytes, filename, type, extra = {}) => {
  const form = new FormData();
  form.append(field, new Blob([bytes], { type }), filename);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
};

const uploadsOnDisk = () => {
  const dir = inject("uploadsDir");
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
};

describe("chat attachment upload", () => {
  it("stores a real PNG under a server-chosen name with an extension from the verified type", async () => {
    const u = await createUser();
    const res = await api("/messages/upload", {
      method: "POST",
      token: u.token,
      form: fileForm("media", PNG, "evil.html", "image/png"),
    });
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("image");
    expect(res.body.url).toMatch(/\/uploads\/media-\d+-\d+\.png$/);

    const auth = { headers: { Authorization: `Bearer ${u.token}` } };
    const served = await fetch(res.body.url, auth);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("x-content-type-options")).toBe("nosniff");

    const dl = await fetch(`${res.body.url}/download`, auth);
    expect(dl.headers.get("content-disposition")).toMatch(/^attachment/);
  });

  it("SECURITY: uploaded files are not readable without logging in", async () => {
    const u = await createUser();
    const res = await api("/messages/upload", { method: "POST", token: u.token, form: fileForm("media", PNG, "a.png", "image/png") });
    expect((await fetch(res.body.url)).status).toBe(401);
    expect((await fetch(`${res.body.url}/download`)).status).toBe(401);
  });

  it("rejects HTML disguised as a PNG and deletes it from disk", async () => {
    const u = await createUser();
    const before = uploadsOnDisk().length;
    const res = await api("/messages/upload", {
      method: "POST",
      token: u.token,
      form: fileForm("media", Buffer.from("<script>alert(1)</script>"), "x.png", "image/png"),
    });
    expect(res.status).toBe(400);
    expect(uploadsOnDisk().length).toBe(before);
  });

  it("rejects a disallowed declared type (text/html, image/svg+xml)", async () => {
    const u = await createUser();
    for (const type of ["text/html", "image/svg+xml"]) {
      const res = await api("/messages/upload", {
        method: "POST",
        token: u.token,
        form: fileForm("media", Buffer.from("<svg onload=alert(1)>"), "x", type),
      });
      expect(res.status, type).toBe(400);
    }
  });

  it("serves a text/plain upload containing HTML as inert text", async () => {
    const u = await createUser();
    const res = await api("/messages/upload", {
      method: "POST",
      token: u.token,
      form: fileForm("media", Buffer.from("<script>alert(1)</script>"), "notes.html", "text/plain"),
    });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/\.txt$/);
    const served = await fetch(res.body.url, { headers: { Authorization: `Bearer ${u.token}` } });
    expect(served.headers.get("content-type")).toMatch(/^text\/plain/);
  });

  it("returns 400 for an oversized file and for the wrong field name", async () => {
    const u = await createUser();
    const big = Buffer.alloc(20 * 1024 * 1024 + 1, 0);
    expect((await api("/messages/upload", { method: "POST", token: u.token, form: fileForm("media", big, "a.txt", "text/plain") })).status).toBe(400);
    expect((await api("/messages/upload", { method: "POST", token: u.token, form: fileForm("wrong", PNG, "a.png", "image/png") })).status).toBe(400);
  });

  it("requires authentication to upload", async () => {
    const res = await api("/messages/upload", { method: "POST", form: fileForm("media", PNG, "a.png", "image/png") });
    expect(res.status).toBe(401);
  });

  it("does not allow path traversal through the download route", async () => {
    const u = await createUser();
    for (const p of ["..%2f..%2fpackage.json", "..%2fserver.log", "%2e%2e%2fserver.log"]) {
      const res = await fetch(`${baseUrl()}/uploads/${p}/download`, { headers: { Authorization: `Bearer ${u.token}` } });
      expect(res.status, p).toBe(404);
    }
  });
});

describe("study materials", () => {
  const upload = (user, extra = {}, file = fileForm("file", PNG, "diagram.png", "image/png", extra)) =>
    api("/materials", { method: "POST", token: user.token, form: file });

  it("uploads, lists, and logs activity for a material", async () => {
    const u = await createUser();
    const res = await upload(u, { name: "Cell diagram", subject: "biology", tags: "cells, mitosis" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Cell diagram", type: "png", tags: ["cells", "mitosis"], likes: 0 });

    const list = await api("/materials?subject=biology", { token: u.token });
    expect(list.body.materials.some((m) => m.id === res.body.id)).toBe(true);
    const act = await api("/activity", { token: u.token });
    expect(act.body[0].type).toBe("material_uploaded");
  });

  it("answers tags sent as repeated multipart fields with a 4xx/2xx, not a 500", async () => {
    const u = await createUser();
    const form = fileForm("file", PNG, "d.png", "image/png");
    form.append("tags", "a");
    form.append("tags", "b");
    const res = await upload(u, {}, form);
    expect(res.status).toBeLessThan(500);
  });

  it("only the uploader or a site admin can delete a material", async () => {
    const owner = await createUser();
    const other = await createUser();
    const admin = await createUser({ admin: true });
    const m1 = (await upload(owner)).body;
    const m2 = (await upload(owner)).body;
    expect((await api(`/materials/${m1.id}`, { method: "DELETE", token: other.token })).status).toBe(403);
    expect((await api(`/materials/${m1.id}`, { method: "DELETE", token: owner.token })).status).toBe(200);
    expect((await api(`/materials/${m2.id}`, { method: "DELETE", token: admin.token })).status).toBe(200);
    expect((await api(`/materials/${m1.id}/like`, { method: "PATCH", token: other.token })).status).toBe(404);
  });

  it("toggles like/bookmark and counts downloads", async () => {
    const owner = await createUser();
    const fan = await createUser();
    const m = (await upload(owner)).body;
    expect((await api(`/materials/${m.id}/like`, { method: "PATCH", token: fan.token })).body).toEqual({ likes: 1, isLiked: true });
    expect((await api(`/materials/${m.id}/like`, { method: "PATCH", token: fan.token })).body).toEqual({ likes: 0, isLiked: false });
    expect((await api(`/materials/${m.id}/bookmark`, { method: "PATCH", token: fan.token })).body).toEqual({ isBookmarked: true });
    const d = await Promise.all(Array.from({ length: 5 }, () => api(`/materials/${m.id}/download`, { method: "POST", token: fan.token })));
    expect(Math.max(...d.map((r) => r.body.downloads))).toBe(5); // $inc is atomic
  });

  it("a double-clicked like (two concurrent requests from one user) counts at most once", async () => {
    const owner = await createUser();
    const fan = await createUser();
    const m = (await upload(owner)).body;
    await Promise.all([1, 2, 3].map(() => api(`/materials/${m.id}/like`, { method: "PATCH", token: fan.token })));
    const db = await connectDb();
    const doc = await db.collection("materials").findOne({ _id: oid(m.id) });
    const fanLikes = doc.likedBy.map(String).filter((id) => id === fan.id).length;
    expect(fanLikes).toBeLessThanOrEqual(1);
  });

  it("concurrent likes from different users and an unlike are not lost", async () => {
    const mismatches = [];
    for (let trial = 0; trial < 5; trial++) {
      const owner = await createUser();
      const m = (await upload(owner)).body;
      const unliker = await createUser();
      await api(`/materials/${m.id}/like`, { method: "PATCH", token: unliker.token });
      const likers = await Promise.all(Array.from({ length: 6 }, () => createUser()));

      const results = await Promise.all([
        api(`/materials/${m.id}/like`, { method: "PATCH", token: unliker.token }), // unlike
        ...likers.map((u) => api(`/materials/${m.id}/like`, { method: "PATCH", token: u.token })),
      ]);
      const db = await connectDb();
      const doc = await db.collection("materials").findOne({ _id: oid(m.id) });
      const got = doc.likedBy.map(String).sort();
      const want = likers.map((u) => u.id).sort();
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        mismatches.push(`trial ${trial}: ${got.length} likes stored, want ${want.length}; statuses ${results.map((r) => r.status)}`);
      }
    }
    expect(mismatches).toEqual([]);
  }, 60_000);

  it("does not let query-string operators widen the material filter", async () => {
    const u = await createUser();
    await upload(u, { subject: "chemistry" });
    // ?subject[$ne]=x is parsed by Express into { $ne: "x" } and reaches Mongo as an operator.
    const res = await api("/materials?subject[$ne]=__nothing__", { token: u.token });
    expect(res.status).toBeLessThan(500);
    expect(res.body.materials ?? []).toEqual([]);
  });
});

void path;
