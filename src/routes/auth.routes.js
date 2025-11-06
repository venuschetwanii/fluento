const Router = require("express").Router;
const bcrypt = require("bcryptjs");
const UserModel = require("../models/user.model");
const { signAccess } = require("../services/token.service");
const {
  sendOTP,
  generateOTP,
  validatePhoneNumber,
} = require("../services/sms.service");
const router = Router();
router.post("/register", async (req, res) => {
  try {
    const { name, email, role, password } = req.body;
    // Students can only sign up with 'student' role (or no role which defaults to student)
    // Admin and tutor roles must be assigned by existing admins
    const allowedRole = role === "student" || !role ? "student" : null;
    if (!allowedRole) {
      return res.status(403).json({
        error:
          "Students can only register with 'student' role. Admin and tutor roles must be assigned by administrators.",
      });
    }
    const hash = await bcrypt.hash(password, 10);
    const user = new UserModel({
      name,
      email,
      passwordHash: hash,
      role: allowedRole,
    });
    await user.save();
    res.json({ message: "Registered" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await UserModel.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });
    const payload = { id: user._id, role: user.role };
    const accessToken = signAccess(payload);
    res.json({
      accessToken: `Bearer ${accessToken}`,
      user,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
// Send OTP to phone number
router.post("/send-otp", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Validate phone number format
    if (!validatePhoneNumber(phone)) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    // Check if user already exists (by phone number)
    let user = await UserModel.findOne({ phone });

    // If user exists and is already verified, allow new OTP for login
    // If user doesn't exist, we'll create one after OTP is sent successfully
    // This prevents creating duplicate users

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    // Send OTP via SMS FIRST (before creating/updating user)
    try {
      const smsResult = await sendOTP(phone, otpCode);

      if (smsResult.status !== "success") {
        return res.status(400).json({
          error: "Failed to send OTP",
          details: smsResult.errors || smsResult.message,
        });
      }

      // Only create/update user record AFTER successful OTP delivery
      if (!user) {
        // Create a temporary user record for OTP verification
        // Only create if user doesn't exist (prevents duplicates)
        user = new UserModel({
          phone,
          isPhoneVerified: false,
          otp: {
            code: otpCode,
            expiresAt: expiresAt,
            attempts: 0,
          },
        });
      } else {
        // User exists - just update OTP (don't create new user)
        // This handles: expired OTP, resend OTP, login with existing user
        user.otp = {
          code: otpCode,
          expiresAt: expiresAt,
          attempts: 0, // Reset attempts for new OTP
        };
      }

      await user.save();

      res.json({
        message: "OTP sent successfully",
        phone: phone,
        expiresIn: 300, // 5 minutes in seconds
      });
    } catch (smsError) {
      console.error("SMS sending error:", smsError);
      res.status(500).json({
        error: "Failed to send OTP. Please try again later.",
      });
    }
  } catch (e) {
    console.error("Send OTP error:", e);
    res.status(400).json({ error: e.message });
  }
});

// Verify OTP and complete registration/login
router.post("/verify-otp", async (req, res) => {
  try {
    const { phone, otp, name, email, role } = req.body;

    if (!phone || !otp) {
      return res
        .status(400)
        .json({ error: "Phone number and OTP are required" });
    }

    // Find user by phone number
    const user = await UserModel.findOne({ phone });

    if (!user) {
      return res
        .status(404)
        .json({ error: "No OTP request found for this phone number" });
    }

    // Check if OTP exists and is not expired
    if (!user.otp || !user.otp.code || !user.otp.expiresAt) {
      return res
        .status(400)
        .json({ error: "No valid OTP found. Please request a new OTP." });
    }

    // Check if OTP is expired
    if (new Date() > user.otp.expiresAt) {
      return res
        .status(400)
        .json({ error: "OTP has expired. Please request a new OTP." });
    }

    // Check if too many attempts
    if (user.otp.attempts >= 3) {
      return res.status(400).json({
        error: "Too many incorrect attempts. Please request a new OTP.",
      });
    }

    // Verify OTP
    if (user.otp.code !== otp) {
      user.otp.attempts += 1;
      await user.save();

      const remainingAttempts = 3 - user.otp.attempts;
      return res.status(400).json({
        error: "Invalid OTP",
        remainingAttempts: remainingAttempts > 0 ? remainingAttempts : 0,
      });
    }

    // OTP is correct - complete the process
    user.isPhoneVerified = true;
    user.otp = undefined; // Clear OTP data

    // If this is a new user registration, set additional fields
    if (name) user.name = name;

    // Check if email is provided and if it already exists for another user
    if (email) {
      const existingUserWithEmail = await UserModel.findOne({
        email: email,
        _id: { $ne: user._id }, // Exclude current user
      });

      if (existingUserWithEmail) {
        return res.status(409).json({
          error:
            "Email already exists. Please use a different email or login with the existing account.",
        });
      }

      user.email = email;
    }

    // Students can only sign up with 'student' role (or no role which defaults to student)
    // Admin and tutor roles must be assigned by existing admins
    if (role) {
      if (role === "student" || !user.role) {
        user.role = "student";
      } else {
        // If trying to set admin/tutor role, reject it
        return res.status(403).json({
          error:
            "Students can only register with 'student' role. Admin and tutor roles must be assigned by administrators.",
        });
      }
    }

    await user.save();

    // Generate JWT token
    const payload = { id: user._id, role: user.role };
    const accessToken = signAccess(payload);

    res.json({
      message: "Phone number verified successfully",
      accessToken: `Bearer ${accessToken}`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isPhoneVerified: user.isPhoneVerified,
      },
    });
  } catch (e) {
    console.error("Verify OTP error:", e);
    res.status(400).json({ error: e.message });
  }
});

// Resend OTP
router.post("/resend-otp", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Validate phone number format
    if (!validatePhoneNumber(phone)) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    // Find user by phone number
    const user = await UserModel.findOne({ phone });

    if (!user) {
      return res
        .status(404)
        .json({ error: "No user found with this phone number" });
    }

    // Check if user can request OTP (not too frequent)
    const lastOtpTime = user.otp?.expiresAt;
    if (
      lastOtpTime &&
      new Date() < new Date(lastOtpTime.getTime() - 4 * 60 * 1000)
    ) {
      return res.status(429).json({
        error: "Please wait before requesting another OTP",
        retryAfter: 60, // seconds
      });
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    // Send OTP via SMS FIRST (before updating user record)
    try {
      const smsResult = await sendOTP(phone, otpCode);

      if (smsResult.status !== "success") {
        return res.status(400).json({
          error: "Failed to resend OTP",
          details: smsResult.errors || smsResult.message,
        });
      }

      // Only update user record AFTER successful OTP delivery
      user.otp = {
        code: otpCode,
        expiresAt: expiresAt,
        attempts: 0,
      };

      await user.save();

      res.json({
        message: "OTP resent successfully",
        phone: phone,
        expiresIn: 300, // 5 minutes in seconds
      });
    } catch (smsError) {
      console.error("SMS sending error:", smsError);
      res.status(500).json({
        error: "Failed to resend OTP. Please try again later.",
      });
    }
  } catch (e) {
    console.error("Resend OTP error:", e);
    res.status(400).json({ error: e.message });
  }
});

// Login with phone number and OTP
router.post("/login-phone", async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (!phone || !otp) {
      return res
        .status(400)
        .json({ error: "Phone number and OTP are required" });
    }

    // Find user by phone number
    const user = await UserModel.findOne({ phone });

    if (!user) {
      return res
        .status(404)
        .json({ error: "No user found with this phone number" });
    }

    if (!user.isPhoneVerified) {
      return res.status(400).json({
        error:
          "Phone number not verified. Please verify your phone number first.",
      });
    }

    // Check if OTP exists and is not expired
    if (!user.otp || !user.otp.code || !user.otp.expiresAt) {
      return res
        .status(400)
        .json({ error: "No valid OTP found. Please request a new OTP." });
    }

    // Check if OTP is expired
    if (new Date() > user.otp.expiresAt) {
      return res
        .status(400)
        .json({ error: "OTP has expired. Please request a new OTP." });
    }

    // Check if too many attempts
    if (user.otp.attempts >= 3) {
      return res.status(400).json({
        error: "Too many incorrect attempts. Please request a new OTP.",
      });
    }

    // Verify OTP
    if (user.otp.code !== otp) {
      user.otp.attempts += 1;
      await user.save();

      const remainingAttempts = 3 - user.otp.attempts;
      return res.status(400).json({
        error: "Invalid OTP",
        remainingAttempts: remainingAttempts > 0 ? remainingAttempts : 0,
      });
    }

    // OTP is correct - clear OTP data and generate token
    user.otp = undefined;
    await user.save();

    const payload = { id: user._id, role: user.role };
    const accessToken = signAccess(payload);

    res.json({
      message: "Login successful",
      accessToken: `Bearer ${accessToken}`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isPhoneVerified: user.isPhoneVerified,
      },
    });
  } catch (e) {
    console.error("Phone login error:", e);
    res.status(400).json({ error: e.message });
  }
});

// Refresh token route removed: using only 7-day access tokens
module.exports = router;
