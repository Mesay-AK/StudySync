// Grants (or revokes) site admin / super admin rights. This is the only way
// to create a super admin, and the way to create the very first admin - the
// in-app "create admin" and "promote" actions themselves require a super admin.
//
//   node scripts/make-admin.js <email>                 # dry run: show what would change
//   node scripts/make-admin.js <email> --apply         # make an existing account an admin
//   node scripts/make-admin.js <email> --super --apply # ...a super admin (implies admin)
//   node scripts/make-admin.js <email> --revoke --apply
//       # remove admin AND super admin rights (refuses to remove the last super admin)
//
//   Create the account if it doesn't exist yet (password via the environment,
//   so it never lands in your shell history):
//   ADMIN_PASSWORD='S3cure!Pass' node scripts/make-admin.js <email> --create --username <name> --super --apply
//
// Reads MONGO_URI from the environment (or .env in the current directory).
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+])[A-Za-z\d!@#$%^&*()_+]{8,}$/;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const emailArg = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--username");

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const main = async () => {
  if (!emailArg) return fail("Usage: node scripts/make-admin.js <email> [--super | --revoke] [--create --username <name>] [--apply]");
  if (flag("--super") && flag("--revoke")) return fail("Use either --super or --revoke, not both.");
  if (!process.env.MONGO_URI) return fail("MONGO_URI is not set");

  const email = emailArg.trim().toLowerCase();
  const apply = flag("--apply");
  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.db.collection("users");

  let user = await users.findOne({ email });

  if (!user) {
    if (!flag("--create")) return fail(`No account with email ${email}. Add --create --username <name> (and ADMIN_PASSWORD) to create one.`);
    if (flag("--revoke")) return fail("Nothing to revoke: that account doesn't exist.");
    const username = option("--username");
    const password = process.env.ADMIN_PASSWORD;
    if (!username) return fail("--create needs --username <name>.");
    if (!password || !PASSWORD_RULE.test(password)) {
      return fail("Set ADMIN_PASSWORD to a strong password (8+ chars, upper, lower, number, one of !@#$%^&*()_+).");
    }
    if (await users.findOne({ username })) return fail(`Username "${username}" is already taken.`);

    const doc = {
      email,
      username,
      displayName: username,
      password: await bcrypt.hash(password, 10),
      isAdmin: true,
      isSuperAdmin: flag("--super"),
      isBanned: false,
      tokenVersion: 0,
      onlineStatus: "offline",
      blockedUsers: [],
      settings: { darkMode: true, language: "en" },
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 0,
    };
    console.log(`Will create ${flag("--super") ? "super admin" : "admin"} account ${email} (username "${username}").`);
    if (!apply) return console.log("Dry run - re-run with --apply to create it.");
    await users.insertOne(doc);
    return console.log("Created.");
  }

  let update;
  if (flag("--revoke")) {
    if (user.isSuperAdmin && (await users.countDocuments({ isSuperAdmin: true })) <= 1) {
      return fail("Refusing: this is the last super admin. Make someone else a super admin first.");
    }
    update = { isAdmin: false, isSuperAdmin: false };
  } else {
    update = flag("--super") ? { isAdmin: true, isSuperAdmin: true } : { isAdmin: true };
  }

  const before = user.isSuperAdmin ? "super admin" : user.isAdmin ? "admin" : "user";
  const after = (update.isSuperAdmin ?? user.isSuperAdmin) ? "super admin" : (update.isAdmin ?? user.isAdmin) ? "admin" : "user";
  console.log(`${email}: ${before} -> ${after}`);
  if (before === after) return console.log("Nothing to change.");
  if (!apply) return console.log("Dry run - re-run with --apply to write this change.");
  // A banned account would be unusable as an admin.
  await users.updateOne({ _id: user._id }, { $set: { ...update, ...(after !== "user" ? { isBanned: false } : {}), updatedAt: new Date() } });
  console.log("Updated.");
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
