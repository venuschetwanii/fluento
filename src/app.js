const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();
const authRoutes = require("./routes/auth.routes");
const examRoutes = require("./routes/exam.routes");
const partRoutes = require("./routes/part.routes");
const sectionRoutes = require("./routes/section.routes");
const groupRoutes = require("./routes/group.routes");
const uploadRoutes = require("./routes/uploads.routes");
const attemptRoutes = require("./routes/attempt.routes");
const courseRoutes = require("./routes/course.routes");
const lessonRoutes = require("./routes/lesson.routes");
const userRoutes = require("./routes/user.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const notificationRoutes = require("./routes/notification.routes");
const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("MongoDB connected");
    // Migrate email index to partial index (allows multiple null emails)
    try {
      const UserModel = require("./models/user.model");
      await UserModel.migrateEmailIndex();
    } catch (error) {
      console.error("Error migrating email index (may already be correct):", error.message);
    }
  })
  .catch((err) => console.error("Mongo error", err));
app.use("/auth", authRoutes);
app.use("/exams", examRoutes);
app.use("/parts", partRoutes);
app.use("/sections", sectionRoutes);
app.use("/groups", groupRoutes);
app.use("/uploads", uploadRoutes);
app.use("/attempts", attemptRoutes);
app.use("/courses", courseRoutes);
app.use("/lessons", lessonRoutes);
app.use("/users", userRoutes);
app.use("/dashboard", dashboardRoutes);
app.use("/notifications", notificationRoutes);

// Background jobs
require("./jobs/attempts.cron");
module.exports = app;
