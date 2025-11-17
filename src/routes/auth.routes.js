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

    // Normalize phone number - handle 91 extension
    // "91999999999" and "9999999999" are the same number
    const normalizedPhone = normalizePhoneNumber(phone);

    // Prepare all possible phone formats to search (with/without 91 extension)
    const originalPhoneCleaned = phone.replace(/\D/g, "");
    const phoneWithPrefix =
      normalizedPhone.length === 10 ? `91${normalizedPhone}` : null;
    const phoneWithoutPrefix =
      originalPhoneCleaned.startsWith("91") &&
      originalPhoneCleaned.length === 12
        ? originalPhoneCleaned.substring(2)
        : null;

    const allPhoneFormats = [normalizedPhone, originalPhoneCleaned, phone];
    if (phoneWithPrefix) allPhoneFormats.push(phoneWithPrefix);
    if (phoneWithoutPrefix) allPhoneFormats.push(phoneWithoutPrefix);
    const uniquePhones = [...new Set(allPhoneFormats)];

    // Find user by phone (irrespective of role)
    let user = await UserModel.findOne({
      phone: { $in: uniquePhones },
    });

    // Generate OTP
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

    // If user exists, check role
    if (user) {
      // If role is admin or tutor, throw error
      if (user.role === "admin" || user.role === "tutor") {
        return res.status(409).json({
          error: `Phone number already exists for a ${user.role} account.`,
        });
      }

      // If role is student, update OTP
      if (user.role === "student") {
        user.otp = {
          code: otpCode,
          expiresAt: expiresAt,
          attempts: 0,
        };
        await user.save();
      }
    } else {
      // User does not exist, create new student user
      try {
        // Create user object without email field (undefined, not null)
        // This prevents sparse index conflicts with null emails
        const userData = {
          phone: normalizedPhone, // Store normalized phone number
          isPhoneVerified: false,
          otp: {
            code: otpCode,
            expiresAt: expiresAt,
            attempts: 0,
          },
        };
        // Explicitly don't set email - leave it undefined
        user = new UserModel(userData);
        await user.save();
      } catch (createError) {
        // Handle duplicate key errors (race conditions)
        if (createError.code === 11000) {
          const isPhoneError = createError.keyPattern?.phone;
          const isEmailError = createError.keyPattern?.email;

          // Wait a bit and try to find the user
          await new Promise((resolve) => setTimeout(resolve, 100));
          user = await UserModel.findOne({
            phone: { $in: uniquePhones },
          });

          if (user) {
            // Check role
            if (user.role === "admin" || user.role === "tutor") {
              return res.status(409).json({
                error: `Phone number already exists for a ${user.role} account.`,
              });
            }
            // Update OTP for student
            user.otp = {
              code: otpCode,
              expiresAt: expiresAt,
              attempts: 0,
            };
            await user.save();
          } else if (isEmailError) {
            // Email conflict - there's likely a user with null email
            // Try to find user with null email and matching phone
            user = await UserModel.findOne({
              phone: { $in: uniquePhones },
              email: null,
            });

            // If not found by direct query, search all students with null email or no email
            // and manually match phone numbers (handles different phone formats)
            if (!user) {
              // Try both null and $exists: false to catch all cases
              const studentsWithNullEmail = await UserModel.find({
                $or: [{ email: null }, { email: { $exists: false } }],
                role: "student",
              });

              // Check if any of these students have a matching phone number
              // Compare against all possible phone formats
              for (const student of studentsWithNullEmail) {
                if (student.phone) {
                  // Normalize the student's phone for comparison
                  const studentPhoneNormalized = normalizePhoneNumber(
                    student.phone
                  );
                  const studentPhoneCleaned = student.phone.replace(/\D/g, "");

                  // Check if student's phone matches any of our search formats
                  if (
                    uniquePhones.includes(student.phone) ||
                    uniquePhones.includes(studentPhoneNormalized) ||
                    uniquePhones.includes(studentPhoneCleaned) ||
                    normalizedPhone === studentPhoneNormalized ||
                    normalizedPhone === studentPhoneCleaned ||
                    normalizedPhone === student.phone
                  ) {
                    user = student;
                    break;
                  }
                }
              }
            }

            if (user) {
              // Found user with null email
              if (user.role === "admin" || user.role === "tutor") {
                return res.status(409).json({
                  error: `Phone number already exists for a ${user.role} account.`,
                });
              }
              user.otp = {
                code: otpCode,
                expiresAt: expiresAt,
                attempts: 0,
              };
              await user.save();
            } else {
              // Still can't find - try creating without email field
              // This handles sparse index issues with null emails
              try {
                user = new UserModel({
                  phone: normalizedPhone,
                  // Don't set email at all - leave it undefined (not null)
                  isPhoneVerified: false,
                  otp: {
                    code: otpCode,
                    expiresAt: expiresAt,
                    attempts: 0,
                  },
                });
                await user.save();
              } catch (retryError) {
                // If still fails, wait and try one more time to find user
                if (retryError.code === 11000) {
                  await new Promise((resolve) => setTimeout(resolve, 300));

                  // Try finding user again with all phone formats
                  user = await UserModel.findOne({
                    phone: { $in: uniquePhones },
                  });

                  // Also try finding by null email with direct query
                  if (!user) {
                    user = await UserModel.findOne({
                      phone: { $in: uniquePhones },
                      email: null,
                    });
                  }

                  // If still not found, search all students with null email or no email and match manually
                  if (!user) {
                    const studentsWithNullEmail = await UserModel.find({
                      $or: [{ email: null }, { email: { $exists: false } }],
                      role: "student",
                    });

                    for (const student of studentsWithNullEmail) {
                      if (student.phone) {
                        const studentPhoneNormalized = normalizePhoneNumber(
                          student.phone
                        );
                        const studentPhoneCleaned = student.phone.replace(
                          /\D/g,
                          ""
                        );

                        if (
                          uniquePhones.includes(student.phone) ||
                          uniquePhones.includes(studentPhoneNormalized) ||
                          uniquePhones.includes(studentPhoneCleaned) ||
                          normalizedPhone === studentPhoneNormalized ||
                          normalizedPhone === studentPhoneCleaned ||
                          normalizedPhone === student.phone
                        ) {
                          user = student;
                          break;
                        }
                      }
                    }
                  }

                  if (user) {
                    if (user.role === "admin" || user.role === "tutor") {
                      return res.status(409).json({
                        error: `Phone number already exists for a ${user.role} account.`,
                      });
                    }
                    user.otp = {
                      code: otpCode,
                      expiresAt: expiresAt,
                      attempts: 0,
                    };
                    await user.save();
                  } else {
                    // Last resort - log error details for debugging
                    console.error("Email conflict - user not found:", {
                      phone: normalizedPhone,
                      originalPhone: phone,
                      uniquePhones: uniquePhones,
                      error: retryError.message,
                    });
                    throw new Error("Failed to create user. Please try again.");
                  }
                } else {
                  throw retryError;
                }
              }
            }
          } else {
            // Phone error but user not found - throw error
            throw new Error("Failed to create user. Please try again.");
          }
        } else {
          // Other errors, throw as is
          throw createError;
        }
      }
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
      const existingUserWithEmail = await UserModel.find({
        email: email,
        _id: { $ne: user._id }, // Exclude current user
      });

      if (existingUserWithEmail.length > 0) {
        return res.status(409).json({
          error:
            "Email already exists. Please use a different email or login with the existing account.",
        });
      }

      // user.email = email;
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
