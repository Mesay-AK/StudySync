// One-time migration for the working Dark mode setting.
//
// The setting used to do nothing: everyone saw the dark UI, while their stored
// settings.darkMode was false (the old default). Now that false really means
// "light theme", existing accounts would suddenly flip to light. This sets
// darkMode to true for every account so nobody's look changes; users can then
// choose light mode themselves.
//
//   node scripts/default-dark-mode.js           # dry run: report only
//   node scripts/default-dark-mode.js --apply   # write the change
//
// Reads MONGO_URI from the environment (or .env in the current directory).
// Run it once, BEFORE or together with deploying the theme change - not
// later, or it would undo light-mode choices made since.
import "dotenv/config";
import mongoose from "mongoose";

const apply = process.argv.includes("--apply");

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI);
  const users = mongoose.connection.db.collection("users");

  const filter = { "settings.darkMode": { $ne: true } };
  const count = await users.countDocuments(filter);
  console.log(`${count} account(s) will be set to dark mode.`);
  if (!apply) {
    if (count > 0) console.log("Dry run - re-run with --apply to write this change.");
    return;
  }
  const result = await users.updateMany(filter, { $set: { "settings.darkMode": true } });
  console.log(`Updated ${result.modifiedCount} account(s).`);
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
