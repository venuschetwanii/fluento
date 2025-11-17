const { Schema, model } = require("mongoose");
const UserSchema = new Schema(
  {
    name: String,
    email: { type: String },
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

// Create a partial unique index on email
// This ensures email is unique when it exists, but allows multiple null/undefined values
// Using $type: "string" excludes null and undefined values from the index
UserSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { email: { $type: "string" } },
  }
);

const UserModel = model("User", UserSchema);

// Ensure the index is properly created and drop old sparse index if it exists
UserModel.on("index", function (error) {
  if (error) {
    console.error("Error creating email index:", error);
  } else {
    console.log("Email partial unique index created successfully");
  }
});

// Function to migrate index (call this once to fix existing database)
UserModel.migrateEmailIndex = async function () {
  try {
    const collection = this.collection;

    // Drop old sparse index if it exists
    try {
      await collection.dropIndex("email_1");
      console.log("Dropped old email_1 index");
    } catch (err) {
      // IndexNotFound error code is 27, or error message contains "index not found"
      if (err.code === 27 || err.message?.includes("index not found")) {
        console.log("Old email index not found or already dropped");
      } else {
        // Some other error occurred
        console.log("Could not drop old index (may not exist):", err.message);
      }
    }

    // Create new partial index
    // Using $type: "string" excludes null and undefined values from the index
    await collection.createIndex(
      { email: 1 },
      {
        unique: true,
        partialFilterExpression: { email: { $type: "string" } },
        name: "email_1",
      }
    );
    console.log("Created new partial unique index on email");
  } catch (error) {
    console.error("Error migrating email index:", error);
    throw error;
  }
};

module.exports = UserModel;
