import mongoose from "mongoose";
import ChatRoom from "../models/ChatRoom.js";

const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

// Membership changes used to be read-modify-write (findById -> push/filter ->
// save), so concurrent joins all passed the capacity check before any of them
// saved (8 members in a room capped at 3), and the same user double-submitting
// a join was added once per request. Doing the capacity + not-already-a-member
// check inside the update filter makes each join a single atomic operation.
//
// `access` narrows which rooms this caller may join, e.g. { type: "public" } or
// { type: "private", invitedUsers: <id> }.
//
// Resolves { status: "joined" | "already" | "full" | "not_found", room }.
export const joinRoomAtomically = async (roomId, userId, access = {}) => {
  const uid = toObjectId(userId);
  const scope = { _id: roomId, isDeleted: false, ...access };

  const joined = await ChatRoom.findOneAndUpdate(
    {
      ...scope,
      members: { $ne: uid },
      $expr: { $lt: [{ $size: "$members" }, "$maxParticipants"] },
    },
    { $addToSet: { members: uid } },
    { new: true }
  );
  if (joined) return { status: "joined", room: joined };

  const current = await ChatRoom.findOne(scope);
  if (!current) return { status: "not_found" };
  if (current.members.some((m) => m.equals(uid))) return { status: "already", room: current };
  return { status: "full", room: current };
};

// A room whose last admin left (or was deleted) can never be moderated or
// edited again - demote already refuses to create that state, so leaving
// can't be a back door to it. The longest-standing remaining member is
// promoted, as one atomic pipeline update per room.
export const ensureRoomsHaveAdmin = (filter) =>
  ChatRoom.updateMany(
    { ...filter, admins: { $size: 0 }, "members.0": { $exists: true } },
    [{ $set: { admins: [{ $arrayElemAt: ["$members", 0] }] } }]
  );

// Removes the user from members AND admins in one atomic update, so a user
// who leaves can't keep room-admin rights. Resolves the updated room, or null
// if they weren't a member/admin to begin with.
export const leaveRoomAtomically = async (roomId, userId) => {
  const uid = toObjectId(userId);
  const room = await ChatRoom.findOneAndUpdate(
    { _id: roomId, $or: [{ members: uid }, { admins: uid }] },
    { $pull: { members: uid, admins: uid } },
    { new: true }
  );
  if (!room) return null;

  await ensureRoomsHaveAdmin({ _id: room._id });
  return ChatRoom.findById(room._id);
};

// For account deletion: drop every reference to the user from every room.
export const removeUserFromAllRooms = async (userId) => {
  const uid = toObjectId(userId);
  const touched = { $or: [{ members: uid }, { admins: uid }, { invitedUsers: uid }] };
  const roomIds = await ChatRoom.find(touched).distinct("_id");
  if (roomIds.length === 0) return;

  await ChatRoom.updateMany({ _id: { $in: roomIds } }, { $pull: { members: uid, admins: uid, invitedUsers: uid } });
  await ensureRoomsHaveAdmin({ _id: { $in: roomIds } });
};
