const { Schema, model } = require("mongoose");
const mongoose = require("mongoose");

const SectionSchema = new Schema(
  {
    examType: String,
    sectionType: { type: String, required: true },
    title: { type: String },
    duration: Number,
    totalQuestions: Number,
    instructions: [String],
    parts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Part" }],
  },
  { _id: true }
); // Keep _id for sections so parts can reference them

module.exports = model("Section", SectionSchema);
