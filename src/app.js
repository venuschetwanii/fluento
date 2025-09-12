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
const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("Mongo error", err));
app.use("/auth", authRoutes);
app.use("/exams", examRoutes);
app.use("/parts", partRoutes);
app.use("/sections", sectionRoutes);
app.use("/groups", groupRoutes);
app.use("/uploads", uploadRoutes);
app.use("/attempts", attemptRoutes);
module.exports = app;
