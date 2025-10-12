const cron = require("node-cron");
const mongoose = require("mongoose");
const AttemptModel = require("../models/attempt.model");

// Ensure Mongo is connected in case this file is required early
// If app.js already connected, this will be a no-op
if (!mongoose.connection.readyState && process.env.MONGO_URI) {
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("[cron] MongoDB connected"))
    .catch((err) => console.error("[cron] Mongo error", err));
}

// Every minute: expire overdue attempts
cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    const result = await AttemptModel.updateMany(
      { status: "in_progress", expiresAt: { $lt: now } },
      { $set: { status: "expired" } }
    );
    if ((result.modifiedCount ?? result.nModified) > 0) {
      console.log(
        `[cron] Expired attempts: ${result.modifiedCount ?? result.nModified}`
      );
    }
  } catch (e) {
    console.error("[cron] expire attempts error", e.message);
  }
});
