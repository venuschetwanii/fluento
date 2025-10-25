const { Schema, model } = require("mongoose");

const LessonSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    type: {
      type: String,
      enum: ["video", "pdf"],
      required: true,
    },
    duration: {
      type: Number,
      required: true,
      min: 0,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    thumbnail: {
      type: String,
      trim: true,
      default: null,
    },
    publishedAt: {
      type: Date,
      default: Date.now,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    order: {
      type: Number,
      required: true,
      min: 0,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

// Index for efficient queries
LessonSchema.index({ course: 1, order: 1 });
LessonSchema.index({ course: 1, deletedAt: 1 });
LessonSchema.index({ type: 1, deletedAt: 1 });

module.exports = model("Lesson", LessonSchema);
