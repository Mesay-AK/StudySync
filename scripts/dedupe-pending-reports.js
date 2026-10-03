// One-time cleanup before deploying Report's partial unique index
// ({ reportedBy, type, targetUser, targetMessage } among PENDING reports).
//
// "Already reported" used to be a check-then-insert, so concurrent requests
// could create duplicate pending reports. MongoDB refuses to build a unique
// index over existing duplicates (Mongoose then only logs the failure, and
// the duplicate protection silently doesn't exist). This keeps the OLDEST
// pending report in each duplicate group and deletes the rest - they're
// exact repeats of the same complaint by the same person.
//
//   node scripts/dedupe-pending-reports.js           # dry run: report only
//   node scripts/dedupe-pending-reports.js --apply   # delete the duplicates
//
// Reads MONGO_URI from the environment (or .env in the current directory).
import "dotenv/config";
import mongoose from "mongoose";

const apply = process.argv.includes("--apply");

const main = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set");
  await mongoose.connect(process.env.MONGO_URI);
  const reports = mongoose.connection.db.collection("reports");

  const groups = await reports
    .aggregate([
      { $match: { status: "pending" } },
      { $sort: { createdAt: 1, _id: 1 } },
      {
        $group: {
          _id: {
            reportedBy: "$reportedBy",
            type: "$type",
            targetUser: { $ifNull: ["$targetUser", null] },
            targetMessage: { $ifNull: ["$targetMessage", null] },
          },
          ids: { $push: "$_id" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  const extraIds = groups.flatMap((g) => g.ids.slice(1));
  console.log(`${groups.length} duplicate group(s); ${extraIds.length} duplicate report(s) to remove.`);
  if (!apply) {
    if (extraIds.length > 0) console.log("Dry run - re-run with --apply to delete them.");
    return;
  }
  if (extraIds.length > 0) {
    const result = await reports.deleteMany({ _id: { $in: extraIds } });
    console.log(`Deleted ${result.deletedCount} duplicate report(s).`);
  }
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
