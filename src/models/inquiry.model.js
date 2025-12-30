const { Schema, model } = require("mongoose");

const InquirySchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    type: {
      type: String,
      enum: ["support", "feedback", "complaint", "general"],
      default: "general",
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 20,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },
    status: {
      type: String,
      enum: ["pending", "in_progress", "resolved", "closed"],
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
InquirySchema.index({ status: 1, createdAt: -1 });
InquirySchema.index({ type: 1, status: 1 });
InquirySchema.index({ email: 1, createdAt: -1 });

module.exports = model("Inquiry", InquirySchema);

