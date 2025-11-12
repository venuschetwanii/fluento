const { Schema, model } = require("mongoose");

const NotificationSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["exam", "course", "admin", "user"],
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["create", "update", "delete", "restore"],
      required: true,
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      index: true,
    },
    entityName: {
      type: String,
      required: true, // e.g., exam title, course title, user name
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    performedByName: {
      type: String,
      required: true, // Store name for quick access
    },
    message: {
      type: String,
      required: true, // Human-readable message
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {}, // Store additional info like old values, new values, etc.
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    readBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes for efficient queries
NotificationSchema.index({ type: 1, action: 1, createdAt: -1 });
NotificationSchema.index({ performedBy: 1, createdAt: -1 });
NotificationSchema.index({ isRead: 1, createdAt: -1 });
NotificationSchema.index({ type: 1, isRead: 1, createdAt: -1 });

module.exports = model("Notification", NotificationSchema);

