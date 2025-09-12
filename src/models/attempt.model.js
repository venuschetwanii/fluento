const { Schema, model } = require("mongoose");
const ResponseSchema = new Schema(
  {
    sectionId: Schema.Types.ObjectId,
    partId: Schema.Types.ObjectId,
    groupId: Schema.Types.ObjectId,
    questionId: Schema.Types.ObjectId,
    response: Schema.Types.Mixed,
    timeSpentMs: Number,
  },
  { _id: false }
);
const AttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    examId: { type: String, ref: "Exam", index: true },
    status: {
      type: String,
      enum: ["in_progress", "submitted", "graded", "expired", "cancelled"],
      default: "in_progress",
    },
    startedAt: { type: Date, default: Date.now },
    expiresAt: Date,
    submittedAt: Date,
    snapshot: Schema.Types.Mixed,
    sectionsStatus: [
      {
        sectionId: { type: Schema.Types.ObjectId, required: true },
        status: {
          type: String,
          enum: ["in_progress", "submitted"],
          default: "in_progress",
        },
        submittedAt: Date,
      },
    ],
    responses: [ResponseSchema],
    scoring: Schema.Types.Mixed,
  },
  { timestamps: true }
);
module.exports = model("Attempt", AttemptSchema);
