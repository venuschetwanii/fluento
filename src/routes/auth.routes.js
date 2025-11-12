const Router = require("express").Router;
const bcrypt = require("bcryptjs");
const UserModel = require("../models/user.model");
const { signAccess } = require("../services/token.service");
const {
  sendOTP,
  generateOTP,
  validatePhoneNumber,
  normalizePhoneNumber,
} = require("../services/sms.service");
const router = Router();
// Register - Only students can sign up
// Admin and tutor accounts must be created by existing admins
router.post("/register", async (req, res) => {
  try {
    const { name, email, role, password } = req.body;

    // Only students can register themselves
    // Admin and tutor roles must be assigned by existing admins
    if (role && role !== "student") {
      return res.status(403).json({
        error:
          "Only students can register. Admin and tutor accounts must be created by administrators.",
      });
    }

    // Force student role (ignore any role provided)
    const hash = await bcrypt.hash(password, 10);
    const user = new UserModel({
      name,
      email,
      passwordHash: hash,
      role: "student", // Always set to student
    });
    await user.save();
    res.json({ message: "Registered successfully" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
// Login - For students only (email/password)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check if user is blocked
    if (user.status === "blocked") {
      return res.status(403).json({
        error: "Your account has been blocked. Please contact administrator.",
      });
    }

    // Check if user has password (admin/tutor might not have password set)
    if (!user.passwordHash) {
      return res.status(401).json({
        error:
          "Invalid credentials. Please use admin login or contact administrator.",
      });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Students can login here, but recommend admin/tutor use admin-login
    if (user.role !== "student") {
      return res.status(403).json({
        error: "Admin and tutor accounts should use the admin login flow.",
      });
    }

    const payload = { id: user._id, role: user.role };
    const accessToken = signAccess(payload);

    // Return user without sensitive data
    const userResponse = user.toObject();
    delete userResponse.passwordHash;
    delete userResponse.otp;

    res.json({
      message: "Login successful",
      accessToken: `Bearer ${accessToken}`,
      user: userResponse,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Admin/Tutor Login - Separate endpoint for admin and tutor
router.post("/admin-login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Only admin and tutor can use this endpoint
    if (!["admin", "tutor"].includes(user.role)) {
      return res.status(403).json({
        error:
          "This login is only for admin and tutor accounts. Students should use the regular login.",
      });
    }

    // Check if user is blocked
    if (user.status === "blocked") {
      return res.status(403).json({
        error: "Your account has been blocked. Please contact administrator.",
      });
    }

    // Check if user has password
    if (!user.passwordHash) {
      return res.status(401).json({
        error:
          "Password not set. Please contact administrator to set your password.",
      });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const payload = { id: user._id, role: user.role };
    const accessToken = signAccess(payload);

    // Return user without sensitive data
    const userResponse = user.toObject();
    delete userResponse.passwordHash;
    delete userResponse.otp;

    res.json({
      message: "Login successful",
      accessToken: `Bearer ${accessToken}`,
      user: userResponse,
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

    // Normalize phone number to prevent duplicate accounts
    // "91999999999" and "9999999999" will both become "9999999999"
    const normalizedPhone = normalizePhoneNumber(phone);

    // CRITICAL: First check for admin/tutor accounts with this phone number
    // This must be done BEFORE any student creation logic
    // Check with normalized phone first
    let existingAdminTutor = await UserModel.findOne({
      phone: normalizedPhone,
      role: { $in: ["admin", "tutor"] },
    });

    // If not found, also check with alternative phone formats
    // This handles cases where tutor was created before normalization or with different format
    if (!existingAdminTutor) {
      const originalPhoneCleaned = phone.replace(/\D/g, "");
      // Try with "91" prefix if it's a 10-digit number
      const phoneWithPrefix =
        normalizedPhone.length === 10 ? `91${normalizedPhone}` : null;
      // Try without "91" prefix if it starts with 91
      const phoneWithoutPrefix =
        originalPhoneCleaned.startsWith("91") &&
        originalPhoneCleaned.length === 12
          ? originalPhoneCleaned.substring(2)
          : null;

      const alternativePhones = [originalPhoneCleaned, phone];
      if (phoneWithPrefix) alternativePhones.push(phoneWithPrefix);
      if (phoneWithoutPrefix) alternativePhones.push(phoneWithoutPrefix);

      // Remove duplicates
      const uniquePhones = [...new Set(alternativePhones)];

      existingAdminTutor = await UserModel.findOne({
        phone: { $in: uniquePhones },
        role: { $in: ["admin", "tutor"] },
      });
    }

    // If admin/tutor account exists, prevent student registration
    if (existingAdminTutor) {
      return res.status(409).json({
        error: `Phone number already exists for a ${existingAdminTutor.role} account. Phone numbers must be unique across all roles. Please contact administrator for ${existingAdminTutor.role} account access.`,
      });
    }

    // Check if user already exists (by normalized phone number)
    let user = await UserModel.findOne({ phone: normalizedPhone });

    // If user exists and is admin/tutor, prevent student registration (double check)
    if (user && ["admin", "tutor"].includes(user.role)) {
      return res.status(409).json({
        error: `Phone number already exists for a ${user.role} account. Phone numbers must be unique across all roles. Please contact administrator for ${user.role} account access.`,
      });
    }

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    // If user does not exist, create new student user
    // Note: We've already checked for admin/tutor accounts above, so it's safe to create student
    if (!user) {
      try {
        user = new UserModel({
          phone: normalizedPhone, // Store normalized phone number
          isPhoneVerified: false,
          otp: {
            code: otpCode,
            expiresAt: expiresAt,
            attempts: 0,
          },
        });
        await user.save();
      } catch (createError) {
        // If user was created between our check and save (race condition)
        if (createError.code === 11000) {
          // Duplicate key error - check which field caused it
          const isEmailError = createError.keyPattern?.email;
          const isPhoneError = createError.keyPattern?.phone;

          if (isPhoneError) {
            // Duplicate phone - user was created by another request
            // First check if it's an admin/tutor account (most critical check)
            await new Promise((resolve) => setTimeout(resolve, 100));

            // Check for admin/tutor with normalized phone
            let foundAdminTutor = await UserModel.findOne({
              phone: normalizedPhone,
              role: { $in: ["admin", "tutor"] },
            });

            // If not found, check with alternative phone formats
            if (!foundAdminTutor) {
              const originalPhoneCleaned = phone.replace(/\D/g, "");
              // Try with "91" prefix if it's a 10-digit number
              const phoneWithPrefix =
                normalizedPhone.length === 10 ? `91${normalizedPhone}` : null;
              // Try without "91" prefix if it starts with 91
              const phoneWithoutPrefix =
                originalPhoneCleaned.startsWith("91") &&
                originalPhoneCleaned.length === 12
                  ? originalPhoneCleaned.substring(2)
                  : null;

              const alternativePhones = [originalPhoneCleaned, phone];
              if (phoneWithPrefix) alternativePhones.push(phoneWithPrefix);
              if (phoneWithoutPrefix)
                alternativePhones.push(phoneWithoutPrefix);

              // Remove duplicates
              const uniquePhones = [...new Set(alternativePhones)];

              foundAdminTutor = await UserModel.findOne({
                phone: { $in: uniquePhones },
                role: { $in: ["admin", "tutor"] },
              });
            }

            if (foundAdminTutor) {
              return res.status(409).json({
                error: `Phone number already exists for a ${foundAdminTutor.role} account. Phone numbers must be unique across all roles. Please contact administrator for ${foundAdminTutor.role} account access.`,
              });
            }

            // If not admin/tutor, find the user (should be student)
            user = await UserModel.findOne({ phone: normalizedPhone });

            if (user) {
              // Double check it's not admin/tutor (shouldn't happen but safety check)
              if (["admin", "tutor"].includes(user.role)) {
                return res.status(409).json({
                  error: `Phone number already exists for a ${user.role} account. Phone numbers must be unique across all roles. Please contact administrator for ${user.role} account access.`,
                });
              }
              // User now exists (student), update OTP instead
              user.otp = {
                code: otpCode,
                expiresAt: expiresAt,
                attempts: 0,
              };
              await user.save();
            } else {
              // If still not found after retry, check one more time for admin/tutor
              // This handles the case where an admin/tutor account exists
              user = await UserModel.findOne({ phone: normalizedPhone });
              if (user) {
                // Check if the user is admin/tutor
                if (["admin", "tutor"].includes(user.role)) {
                  return res.status(409).json({
                    error: `Phone number already exists for a ${user.role} account. Phone numbers must be unique across all roles.`,
                  });
                }
                // User is student, update OTP
                user.otp = {
                  code: otpCode,
                  expiresAt: expiresAt,
                  attempts: 0,
                };
                await user.save();
              } else {
                // If user still doesn't exist, it means there was a race condition
                // Try one final check before giving up
                await new Promise((resolve) => setTimeout(resolve, 200));
                user = await UserModel.findOne({ phone: normalizedPhone });
                if (user) {
                  if (["admin", "tutor"].includes(user.role)) {
                    return res.status(409).json({
                      error: `Phone number already exists for a ${user.role} account. Phone numbers must be unique across all roles.`,
                    });
                  }
                  user.otp = {
                    code: otpCode,
                    expiresAt: expiresAt,
                    attempts: 0,
                  };
                  await user.save();
                } else {
                  throw new Error(
                    "Failed to create or find user. Please try again."
                  );
                }
              }
            }
          } else if (isEmailError) {
            // Duplicate email (null) - find user by phone instead
            user = await UserModel.findOne({ phone: normalizedPhone });
            if (user) {
              // Check if the user is admin/tutor
              if (["admin", "tutor"].includes(user.role)) {
                return res.status(409).json({
                  error: `Phone number already exists for a ${user.role} account. Phone numbers must be unique across all roles.`,
                });
              }
              user.otp = {
                code: otpCode,
                expiresAt: expiresAt,
                attempts: 0,
              };
              await user.save();
            } else {
              // If user not found by phone, try to find by email (though unlikely)
              throw new Error(
                "Failed to create user due to email conflict. Please try again."
              );
            }
          } else {
            // Unknown duplicate key error
            throw createError;
          }
        } else {
          throw createError;
        }
      }
    } else {
      // If user exists, update the OTP
      user.otp = {
        code: otpCode,
        expiresAt: expiresAt,
        attempts: 0, // Reset attempts for new OTP
      };
      await user.save();
    }

    // Send OTP via SMS (use original phone for SMS, normalized for storage)
    try {
      const smsResult = await sendOTP(phone, otpCode);

      if (smsResult.status !== "success") {
        return res.status(400).json({
          error: "Failed to send OTP",
          details: smsResult.errors || smsResult.message,
        });
      }

      res.json({
        message: "OTP sent successfully",
        phone: phone,
        expiresIn: 300, // 5 minutes in seconds
      });
    } catch (smsError) {
      console.error("SMS sending error:", smsError);
      res.status(500).json({
        error: "Failed to send OTP. Please try again later.",
        details: smsError.message,
      });
    }
  } catch (e) {
    console.error("Send OTP error:", e);
    res.status(400).json({ error: e.message });
  }
});

// Send OTP for Admin/Tutor only - User must exist and be admin/tutor
router.post("/admin-send-otp", async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Validate phone number format
    if (!validatePhoneNumber(phone)) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phone);

    // Check if user exists (by normalized phone number)
    let user = await UserModel.findOne({ phone: normalizedPhone });

    // If not found, check with alternative phone formats
    // This handles cases where user was created before normalization or with different format
    if (!user) {
      const originalPhoneCleaned = phone.replace(/\D/g, "");
      // Try with "91" prefix if it's a 10-digit number
      const phoneWithPrefix =
        normalizedPhone.length === 10 ? `91${normalizedPhone}` : null;
      // Try without "91" prefix if it starts with 91
      const phoneWithoutPrefix =
        originalPhoneCleaned.startsWith("91") &&
        originalPhoneCleaned.length === 12
          ? originalPhoneCleaned.substring(2)
          : null;

      const alternativePhones = [originalPhoneCleaned, phone];
      if (phoneWithPrefix) alternativePhones.push(phoneWithPrefix);
      if (phoneWithoutPrefix) alternativePhones.push(phoneWithoutPrefix);

      // Remove duplicates
      const uniquePhones = [...new Set(alternativePhones)];

      user = await UserModel.findOne({
        phone: { $in: uniquePhones },
      });
    }

    // User must exist and be admin or tutor
    if (!user) {
      return res.status(404).json({
        error: "No admin or tutor account found with this phone number",
      });
    }

    // Verify user is admin or tutor
    if (!["admin", "tutor"].includes(user.role)) {
      return res.status(403).json({
        error:
          "This endpoint is only for admin and tutor accounts. Students should use the student registration flow.",
      });
    }

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    // Update OTP for existing admin/tutor user
    user.otp = {
      code: otpCode,
      expiresAt: expiresAt,
      attempts: 0, // Reset attempts for new OTP
    };
    await user.save();

    // Send OTP via SMS
    try {
      const smsResult = await sendOTP(phone, otpCode);

      if (smsResult.status !== "success") {
        return res.status(400).json({
          error: "Failed to send OTP",
          details: smsResult.errors || smsResult.message,
        });
      }

      res.json({
        message: "OTP sent successfully",
        phone: phone,
        expiresIn: 300, // 5 minutes in seconds
      });
    } catch (smsError) {
      console.error("SMS sending error:", smsError);
      res.status(500).json({
        error: "Failed to send OTP. Please try again later.",
        details: smsError.message,
      });
    }
  } catch (e) {
    console.error("Admin send OTP error:", e);
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

    // Validate phone number format (accepts both "91xxxxxxxxxx" and "xxxxxxxxxx")
    if (!validatePhoneNumber(phone)) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    // Normalize phone number to find user
    // This ensures "91999999999" and "9999999999" are treated as the same
    const normalizedPhone = normalizePhoneNumber(phone);

    // Find user by normalized phone number
    let user = await UserModel.findOne({ phone: normalizedPhone });

    // If not found, check with alternative phone formats
    if (!user) {
      const originalPhoneCleaned = phone.replace(/\D/g, "");
      const phoneWithPrefix =
        normalizedPhone.length === 10 ? `91${normalizedPhone}` : null;
      const phoneWithoutPrefix =
        originalPhoneCleaned.startsWith("91") &&
        originalPhoneCleaned.length === 12
          ? originalPhoneCleaned.substring(2)
          : null;

      const alternativePhones = [originalPhoneCleaned, phone];
      if (phoneWithPrefix) alternativePhones.push(phoneWithPrefix);
      if (phoneWithoutPrefix) alternativePhones.push(phoneWithoutPrefix);

      const uniquePhones = [...new Set(alternativePhones)];

      user = await UserModel.findOne({
        phone: { $in: uniquePhones },
      });
    }

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

    // Only students can register via OTP
    // Admin and tutor roles must be assigned by existing admins
    if (role && role !== "student") {
      return res.status(403).json({
        error:
          "Only students can register via OTP. Admin and tutor accounts must be created by administrators.",
      });
    }

    // Verify user is student (admin/tutor should use admin-verify-otp)
    if (!["student"].includes(user.role)) {
      return res.status(403).json({
        error:
          "This endpoint is only for students. Admin and tutor accounts should use the admin/tutor verification flow.",
      });
    }

    // Force student role for OTP registration
    if (!user.role || user.role !== "student") {
      user.role = "student";
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

// Verify OTP for Admin/Tutor only - User must exist and be admin/tutor
router.post("/admin-verify-otp", async (req, res) => {
  try {
    const { phone, otp, name, email } = req.body;

    if (!phone || !otp) {
      return res
        .status(400)
        .json({ error: "Phone number and OTP are required" });
    }

    // Validate phone number format (accepts both "91xxxxxxxxxx" and "xxxxxxxxxx")
    if (!validatePhoneNumber(phone)) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    // Normalize phone number to find user
    const normalizedPhone = normalizePhoneNumber(phone);

    // Find user by normalized phone number
    let user = await UserModel.findOne({ phone: normalizedPhone });

    // If not found, check with alternative phone formats
    // This handles cases where user was created before normalization or with different format
    if (!user) {
      const originalPhoneCleaned = phone.replace(/\D/g, "");
      // Try with "91" prefix if it's a 10-digit number
      const phoneWithPrefix =
        normalizedPhone.length === 10 ? `91${normalizedPhone}` : null;
      // Try without "91" prefix if it starts with 91
      const phoneWithoutPrefix =
        originalPhoneCleaned.startsWith("91") &&
        originalPhoneCleaned.length === 12
          ? originalPhoneCleaned.substring(2)
          : null;

      const alternativePhones = [originalPhoneCleaned, phone];
      if (phoneWithPrefix) alternativePhones.push(phoneWithPrefix);
      if (phoneWithoutPrefix) alternativePhones.push(phoneWithoutPrefix);

      // Remove duplicates
      const uniquePhones = [...new Set(alternativePhones)];

      user = await UserModel.findOne({
        phone: { $in: uniquePhones },
      });
    }

    if (!user) {
      return res.status(404).json({
        error: "No admin or tutor account found with this phone number",
      });
    }

    // Verify user is admin or tutor
    if (!["admin", "tutor"].includes(user.role)) {
      return res.status(403).json({
        error:
          "This endpoint is only for admin and tutor accounts. Students should use the student verification flow.",
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

    // OTP is correct - complete the process
    user.isPhoneVerified = true;
    user.otp = undefined; // Clear OTP data

    // Allow updating name if provided
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

    // Do NOT allow role changes - admin/tutor roles are fixed
    // Role is already set when account was created by admin

    await user.save();

    // Generate JWT token
    const payload = { id: user._id, role: user.role };
    const accessToken = signAccess(payload);

    // Return user without sensitive data
    const userResponse = user.toObject();
    delete userResponse.passwordHash;
    delete userResponse.otp;

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
    console.error("Admin verify OTP error:", e);
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

    // Normalize phone number to find user
    const normalizedPhone = normalizePhoneNumber(phone);

    // Find user by normalized phone number
    let user = await UserModel.findOne({ phone: normalizedPhone });

    // If not found, check with alternative phone formats
    if (!user) {
      const originalPhoneCleaned = phone.replace(/\D/g, "");
      const phoneWithPrefix =
        normalizedPhone.length === 10 ? `91${normalizedPhone}` : null;
      const phoneWithoutPrefix =
        originalPhoneCleaned.startsWith("91") &&
        originalPhoneCleaned.length === 12
          ? originalPhoneCleaned.substring(2)
          : null;

      const alternativePhones = [originalPhoneCleaned, phone];
      if (phoneWithPrefix) alternativePhones.push(phoneWithPrefix);
      if (phoneWithoutPrefix) alternativePhones.push(phoneWithoutPrefix);

      const uniquePhones = [...new Set(alternativePhones)];

      user = await UserModel.findOne({
        phone: { $in: uniquePhones },
      });
    }

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

    // Normalize phone number to find user
    const normalizedPhone = normalizePhoneNumber(phone);

    // Find user by normalized phone number
    let user = await UserModel.findOne({ phone: normalizedPhone });

    // If not found, check with alternative phone formats
    if (!user) {
      const originalPhoneCleaned = phone.replace(/\D/g, "");
      const phoneWithPrefix =
        normalizedPhone.length === 10 ? `91${normalizedPhone}` : null;
      const phoneWithoutPrefix =
        originalPhoneCleaned.startsWith("91") &&
        originalPhoneCleaned.length === 12
          ? originalPhoneCleaned.substring(2)
          : null;

      const alternativePhones = [originalPhoneCleaned, phone];
      if (phoneWithPrefix) alternativePhones.push(phoneWithPrefix);
      if (phoneWithoutPrefix) alternativePhones.push(phoneWithoutPrefix);

      const uniquePhones = [...new Set(alternativePhones)];

      user = await UserModel.findOne({
        phone: { $in: uniquePhones },
      });
    }

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
