const { Schema, model } = require("mongoose");
const mongoose = require("mongoose");

const ExamSchema = new Schema(
  {
    _id: String,
    title: { type: String, required: true },
    type: { type: String, required: true },
    duration: Number,
    totalQuestions: Number,
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },
    sections: [{ type: mongoose.Schema.Types.ObjectId, ref: "Section" }],
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

// Prevent duplicate exams with same title and type
ExamSchema.index({ title: 1, type: 1 }, { unique: true });

module.exports = model("Exam", ExamSchema);
