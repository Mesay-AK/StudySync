// One-time migration for case-insensitive emails: lowercases and trims every
// stored user email to match what the app now writes and looks up.
//
// Run BEFORE (or together with) deploying the case-insensitive email change:
// until it has run, an account stored as "Ann@x.com" can't log in, because
// logins now look up "ann@x.com".
//
//   node scripts/normalize-emails.js           # dry run: report only
//   node scripts/normalize-emails.js --apply   # write the changes
//
// Reads MONGO_URI from the environment (or .env in the current directory).
// If two accounts differ only by email case, nothing is changed: lowercasing
// would collide on the unique email index, and which account to keep (or
// what to rename one to) is a human decision. They're listed so you can
// resolve them, then re-run.
import "dotenv/config";
import mongoose from "mongoose";

const apply = process.argv.includes("--apply");

const normalizedEmail = { $toLower: { $trim: { input: "$email" } } };

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.db.collection("users");

  const collisions = await users
    .aggregate([
      { $match: { email: { $type: "string" } } },
      { $group: { _id: normalizedEmail, accounts: { $push: { id: "$_id", username: "$username", email: "$email" } }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  if (collisions.length > 0) {
    console.error(`Found ${collisions.length} email(s) shared by multiple accounts once case is ignored. Nothing was changed.`);
    for (const c of collisions) {
      console.error(`\n  ${c._id}`);
      for (const a of c.accounts) console.error(`    - ${a.id}  username=${a.username}  email=${JSON.stringify(a.email)}`);
    }
    console.error("\nResolve these (merge, delete, or change one account's email), then re-run.");
    process.exitCode = 1;
    return;
  }

  const toFix = await users
    .find({ email: { $type: "string" }, $expr: { $ne: ["$email", normalizedEmail] } })
    .project({ email: 1 })
    .toArray();

  console.log(`${toFix.length} account(s) need their email normalized.`);
  if (!apply) {
    for (const u of toFix) console.log(`  ${u._id}: ${JSON.stringify(u.email)} -> ${JSON.stringify(u.email.trim().toLowerCase())}`);
    if (toFix.length > 0) console.log("\nDry run - re-run with --apply to write these changes.");
    return;
  }

  if (toFix.length > 0) {
    const result = await users.bulkWrite(
      toFix.map((u) => ({ updateOne: { filter: { _id: u._id }, update: { $set: { email: u.email.trim().toLowerCase() } } } }))
    );
    console.log(`Updated ${result.modifiedCount} account(s).`);
  }
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
