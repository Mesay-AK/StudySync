// Errors whose English text contains values carry a stable code + params so
// the frontend can phrase them in the user's language.
import { describe, it, expect, afterAll } from "vitest";
import mongoose from "mongoose";
import { api, baseUrl, createUser, createRoom, teardownClients, uniq, STRONG_PASSWORD } from "./helpers/client.js";
import { sendError } from "../src/utils/errorResponse.js";

afterAll(teardownClients);

describe("error codes over HTTP", () => {
  it("database validation errors list each problem with a code and the field", async () => {
    const u = await createUser();
    const res = await api("/chatrooms/create", { method: "POST", token: u.token, body: { name: "x", type: "secret" } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_FAILED");
    expect(res.body.errors).toEqual([{ code: "ENUM", params: { field: "type", value: "secret" } }]);
    expect(typeof res.body.message).toBe("string"); // English text still there
  });

  it("a malformed id says which field, with a code", async () => {
    const u = await createUser();
    const res = await api("/chatrooms/not-an-id", { token: u.token });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "INVALID_FIELD", params: { field: "_id" } });
  });

  it("the room-capacity error carries the member count as a parameter", async () => {
    const owner = await createUser();
    const room = await createRoom(owner);
    const member = await createUser();
    await api(`/chatrooms/join-public/${room._id}`, { method: "POST", token: member.token });
    const res = await api(`/chatrooms/${room._id}`, { method: "PATCH", token: owner.token, body: { maxParticipants: 1 } });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "MAX_BELOW_MEMBERS", params: { count: 2 } });
  });

  it("a non-text profile field says which field", async () => {
    const u = await createUser();
    const res = await api(`/user/${u.id}`, { method: "PATCH", token: u.token, body: { bio: 5 } });
    expect(res.body).toMatchObject({ code: "MUST_BE_TEXT", params: { field: "bio" } });
  });

  it("a duplicate email at sign-up names the field", async () => {
    const u = await createUser();
    const res = await api("/auth/register", { method: "POST", body: { username: uniq("d"), email: u.email, password: STRONG_PASSWORD } });
    expect(res.body).toMatchObject({ message: "Email already in use", code: "ALREADY_IN_USE", params: { field: "email" } });
  });

  it("malformed JSON gets a fixed, translatable message instead of the parser's text", async () => {
    const res = await fetch(`${baseUrl()}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{bad" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "The request was not valid JSON.", code: "MALFORMED_JSON" });
  });

  it("static messages keep their plain { message } shape", async () => {
    const res = await api("/auth/login", { method: "POST", body: { email: "nobody@x.test", password: "Wrong!Pass1" } });
    expect(res.body).toEqual({ message: "Invalid email or password" });
  });
});

describe("sendError mapping (unit)", () => {
  const fakeRes = () => {
    const res = { req: { log: { error: () => {} } } };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
  };
  const Thing = mongoose.models.ErrorCodeThing || mongoose.model("ErrorCodeThing", new mongoose.Schema({
    title: { type: String, required: true, minlength: 3, maxlength: 10 },
    seats: { type: Number, min: 1, max: 5 },
    kind: { type: String, enum: ["a", "b"] },
  }));

  it("describes required, length, range and enum problems with limits", () => {
    const res = fakeRes();
    sendError(res, new Thing({ seats: 9, kind: "zzz" }).validateSync());
    const byField = Object.fromEntries(res.body.errors.map((e) => [e.params.field, e]));
    expect(byField.title).toEqual({ code: "REQUIRED", params: { field: "title" } });
    expect(byField.seats).toEqual({ code: "MAX", params: { field: "seats", limit: 5 } });
    expect(byField.kind).toEqual({ code: "ENUM", params: { field: "kind", value: "zzz" } });

    const res2 = fakeRes();
    sendError(res2, new Thing({ title: "ab", seats: 0 }).validateSync());
    const byField2 = Object.fromEntries(res2.body.errors.map((e) => [e.params.field, e]));
    expect(byField2.title).toEqual({ code: "MIN_LENGTH", params: { field: "title", limit: 3 } });
    expect(byField2.seats).toEqual({ code: "MIN", params: { field: "seats", limit: 1 } });
  });

  it("a value that can't be cast is reported as INVALID for that field", () => {
    const res = fakeRes();
    sendError(res, new Thing({ title: "fine", seats: "lots" }).validateSync());
    expect(res.body.errors).toEqual([{ code: "INVALID", params: { field: "seats" } }]);
  });

  it("does not echo back long or non-text values", () => {
    const res = fakeRes();
    sendError(res, new Thing({ title: "fine", kind: "x".repeat(200) }).validateSync());
    expect(res.body.errors[0].params).toEqual({ field: "kind" });
  });

  it("duplicate keys report the field", () => {
    const res = fakeRes();
    sendError(res, { code: 11000, keyPattern: { username: 1 } });
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ message: "That username is already in use.", code: "ALREADY_IN_USE", params: { field: "username" } });
  });

  it("anything else uses the endpoint's fallback text with no code", () => {
    const res = fakeRes();
    sendError(res, new Error("db exploded: secret internals"), "Failed to fetch rooms.");
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: "Failed to fetch rooms." });
  });
});
