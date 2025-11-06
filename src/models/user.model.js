const { Schema, model } = require("mongoose");
const UserSchema = new Schema(
  {
    name: String,
    email: { type: String, unique: true, index: true, sparse: true },
    phone: { type: String, unique: true, index: true, sparse: true },
    passwordHash: { type: String },
    role: {
      type: String,
      enum: ["student", "admin", "tutor"],
      default: "student",
    },
    status: { type: String, enum: ["active", "blocked"], default: "active" },
    otp: {
      code: String,
      expiresAt: Date,
      attempts: { type: Number, default: 0 },
    },
    isPhoneVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);
module.exports = model("User", UserSchema);
