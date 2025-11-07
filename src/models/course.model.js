const { Schema, model } = require("mongoose");

const CourseSchema = new Schema(
  {
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    publishedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "draft",
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    examType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    thumbnail: {
      type: String,
      trim: true,
      default: null,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    studentsCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Index for efficient queries
CourseSchema.index({ title: 1, examType: 1 });
CourseSchema.index({ status: 1, deletedAt: 1 });
CourseSchema.index({ createdBy: 1, status: 1 });
CourseSchema.index({ publishedBy: 1, status: 1 });
CourseSchema.index({ category: 1, status: 1 });
CourseSchema.index({ studentsCount: -1 });

// Virtual for published status
CourseSchema.virtual("isPublished").get(function () {
  return this.status === "published";
});

// Virtual for lessons
CourseSchema.virtual("lessons", {
  ref: "Lesson",
  localField: "_id",
  foreignField: "course",
  match: { deletedAt: null },
  options: { sort: { order: 1 } },
});

// Pre-save middleware to set publishedAt when status changes to published
CourseSchema.pre("save", function (next) {
  if (
    this.isModified("status") &&
    this.status === "published" &&
    !this.publishedAt
  ) {
    this.publishedAt = new Date();
  }
  next();
});

module.exports = model("Course", CourseSchema);
