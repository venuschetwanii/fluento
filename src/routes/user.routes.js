const Router = require("express").Router;
const bcrypt = require("bcryptjs");
const UserModel = require("../models/user.model");
const AttemptModel = require("../models/attempt.model");
const ExamModel = require("../models/exam.model");
const auth = require("../middlewares/auth.middleware");
const { notifyAdminChange } = require("../services/notification.service");
const { sendAdminAccountCreatedEmail } = require("../services/email.service");

const router = Router();

// Role-based guard for admin-only operations
const requireAdmin = (req, res, next) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res
        .status(403)
        .json({ error: "Forbidden: Admin access required" });
    }
    return next();
  } catch (e) {
    return res.status(403).json({ error: "Forbidden" });
  }
};

// Role-based guard for admin and tutor
const requireAdminOrTutor = (req, res, next) => {
  try {
    if (!req.user || !["admin", "tutor"].includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: "Forbidden: Admin or tutor access required" });
    }
    return next();
  } catch (e) {
    return res.status(403).json({ error: "Forbidden" });
  }
};

// Protect all user management routes with JWT auth
router.use(auth);

// **GET** current user profile (self-service)
router.get("/me", async (req, res) => {
  try {
    const user = await UserModel.findById(req.user.id).select(
      "-passwordHash -otp"
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid User ID" });
    }
    res.status(500).json({ error: error.message });
  }
});

// **UPDATE** current user profile (self-service)
router.put("/me", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Find current user
    const user = await UserModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== user.email) {
      const existingUser = await UserModel.findOne({ email });
      if (existingUser) {
        return res.status(409).json({
          error: "Email already in use by another user",
        });
      }
      user.email = email;
    }

    // Check if phone is being changed and if it's already taken
    if (phone && phone !== user.phone) {
      const existingUser = await UserModel.findOne({ phone });
      if (existingUser) {
        return res.status(409).json({
          error: "Phone number already in use by another user",
        });
      }
      user.phone = phone;
    }

    // Update allowed fields (users cannot change role or status themselves)
    if (name !== undefined) user.name = name;

    // Update password if provided
    if (password) {
      user.passwordHash = await bcrypt.hash(password, 10);
    }

    await user.save();

    // Return user without sensitive data
    const userResponse = user.toObject();
    delete userResponse.passwordHash;
    delete userResponse.otp;

    res.json({
      message: "Profile updated successfully",
      user: userResponse,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid User ID" });
    }
    res.status(400).json({ error: error.message });
  }
});

// **LIST** all students (admin and tutor access) with attempts and scores
// Supports filtering and sorting by analytics fields
router.get("/students", requireAdminOrTutor, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      q,
      sortBy = "createdAt",
      sortOrder = "desc",
      includeAttempts = "true",
      // Filter by analytics
      minAttempts,
      maxAttempts,
      minGradedAttempts,
      maxGradedAttempts,
      minAverageScore,
      maxAverageScore,
      minAverageAccuracy,
      maxAverageAccuracy,
    } = req.query;

    const query = { role: "student" };

    // Filter by status if provided
    if (status && ["active", "blocked"].includes(status)) {
      query.status = status;
    }

    // Search by name, email, or phone
    if (q) {
      query.$or = [
        { name: { $regex: String(q), $options: "i" } },
        { email: { $regex: String(q), $options: "i" } },
        { phone: { $regex: String(q), $options: "i" } },
      ];
    }

    // Fetch all students matching basic filters (before pagination)
    const allStudents = await UserModel.find(query)
      .select("-passwordHash -otp")
      .lean();

    // Fetch attempts for all students in parallel
    const studentIds = allStudents.map((s) => s._id);
    const allAttempts = await AttemptModel.find({
      userId: { $in: studentIds },
    })
      .select("userId examId status startedAt submittedAt scoring createdAt")
      .populate("examId", "title type")
      .lean();

    // Group attempts by userId
    const attemptsByUser = {};
    allAttempts.forEach((attempt) => {
      const userId = String(attempt.userId);
      if (!attemptsByUser[userId]) {
        attemptsByUser[userId] = [];
      }
      attemptsByUser[userId].push(attempt);
    });

    // Process each student with their attempts and analytics
    let studentsWithAnalytics = allStudents.map((student) => {
      const studentObj = { ...student };
      const userId = String(student._id);
      const attempts = attemptsByUser[userId] || [];

      // Format attempts with exam info and scores
      // Sort by startedAt (most recent first), fallback to createdAt
      const formattedAttempts = attempts
        .sort((a, b) => {
          const dateA = a.startedAt || a.createdAt || new Date(0);
          const dateB = b.startedAt || b.createdAt || new Date(0);
          return new Date(dateB) - new Date(dateA);
        })
        .slice(0, 50) // Limit to recent 50 attempts
        .map((attempt) => {
          return {
            _id: attempt._id,
            exam: attempt.examId
              ? {
                  _id: attempt.examId._id || attempt.examId,
                  title: attempt.examId.title,
                  type: attempt.examId.type,
                }
              : null,
            status: attempt.status,
            startedAt: attempt.startedAt,
            submittedAt: attempt.submittedAt,
            score: attempt.scoring?.score || 0,
            maxScore: attempt.scoring?.maxScore || 0,
            accuracy: attempt.scoring?.accuracy || 0,
            scaledScore: attempt.scoring?.scaled?.score || null,
            scaledType: attempt.scoring?.scaled?.type || null,
          };
        });

      // Calculate summary statistics from ALL attempts (for accurate sorting/filtering)
      const totalAttempts = attempts.length;
      const gradedAttempts = attempts.filter((a) => a.status === "graded");
      const gradedCount = gradedAttempts.length;

      // Calculate averages from all graded attempts
      const averageScore =
        gradedCount > 0
          ? gradedAttempts.reduce(
              (sum, a) => sum + (a.scoring?.score || 0),
              0
            ) / gradedCount
          : 0;
      const averageAccuracy =
        gradedCount > 0
          ? gradedAttempts.reduce(
              (sum, a) => sum + (a.scoring?.accuracy || 0),
              0
            ) / gradedCount
          : 0;

      const attemptsSummary = {
        total: totalAttempts,
        graded: gradedCount,
        averageScore: Math.round(averageScore * 100) / 100,
        averageAccuracy: Math.round(averageAccuracy * 100) / 100,
      };

      return {
        ...studentObj,
        attempts: includeAttempts === "true" ? formattedAttempts : [],
        attemptsSummary,
        // Add analytics fields for sorting/filtering
        _analytics: {
          totalAttempts,
          gradedAttempts: gradedCount,
          averageScore,
          averageAccuracy,
        },
      };
    });

    // Apply analytics filters
    if (minAttempts !== undefined) {
      studentsWithAnalytics = studentsWithAnalytics.filter(
        (s) => s._analytics.totalAttempts >= Number(minAttempts)
      );
    }
    if (maxAttempts !== undefined) {
      studentsWithAnalytics = studentsWithAnalytics.filter(
        (s) => s._analytics.totalAttempts <= Number(maxAttempts)
      );
    }
    if (minGradedAttempts !== undefined) {
      studentsWithAnalytics = studentsWithAnalytics.filter(
        (s) => s._analytics.gradedAttempts >= Number(minGradedAttempts)
      );
    }
    if (maxGradedAttempts !== undefined) {
      studentsWithAnalytics = studentsWithAnalytics.filter(
        (s) => s._analytics.gradedAttempts <= Number(maxGradedAttempts)
      );
    }
    if (minAverageScore !== undefined) {
      studentsWithAnalytics = studentsWithAnalytics.filter(
        (s) => s._analytics.averageScore >= Number(minAverageScore)
      );
    }
    if (maxAverageScore !== undefined) {
      studentsWithAnalytics = studentsWithAnalytics.filter(
        (s) => s._analytics.averageScore <= Number(maxAverageScore)
      );
    }
    if (minAverageAccuracy !== undefined) {
      studentsWithAnalytics = studentsWithAnalytics.filter(
        (s) => s._analytics.averageAccuracy >= Number(minAverageAccuracy)
      );
    }
    if (maxAverageAccuracy !== undefined) {
      studentsWithAnalytics = studentsWithAnalytics.filter(
        (s) => s._analytics.averageAccuracy <= Number(maxAverageAccuracy)
      );
    }

    // Apply sorting
    const validSortFields = [
      "name",
      "email",
      "createdAt",
      "updatedAt",
      "totalAttempts",
      "gradedAttempts",
      "averageScore",
      "averageAccuracy",
    ];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    studentsWithAnalytics.sort((a, b) => {
      let aVal, bVal;

      if (sortField === "totalAttempts") {
        aVal = a._analytics.totalAttempts;
        bVal = b._analytics.totalAttempts;
      } else if (sortField === "gradedAttempts") {
        aVal = a._analytics.gradedAttempts;
        bVal = b._analytics.gradedAttempts;
      } else if (sortField === "averageScore") {
        aVal = a._analytics.averageScore;
        bVal = b._analytics.averageScore;
      } else if (sortField === "averageAccuracy") {
        aVal = a._analytics.averageAccuracy;
        bVal = b._analytics.averageAccuracy;
      } else {
        aVal = a[sortField] || "";
        bVal = b[sortField] || "";
      }

      // Handle string comparison for name/email
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection * aVal.localeCompare(bVal);
      }

      // Handle date comparison
      if (aVal instanceof Date && bVal instanceof Date) {
        return sortDirection * (aVal.getTime() - bVal.getTime());
      }

      // Handle number comparison
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection * (aVal - bVal);
      }

      // Fallback comparison
      if (aVal < bVal) return -1 * sortDirection;
      if (aVal > bVal) return 1 * sortDirection;
      return 0;
    });

    // Apply pagination
    const total = studentsWithAnalytics.length;
    const skip = (Number(page) - 1) * Number(limit);
    const items = studentsWithAnalytics.slice(skip, skip + Number(limit));

    // Remove internal _analytics field from response
    const cleanedItems = items.map(({ _analytics, ...rest }) => rest);

    res.json({
      items: cleanedItems,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// **LIST** all users (admin only) - excludes students by default
router.get("/", requireAdmin, async (req, res) => {
  try {
    const { role, status, q } = req.query;

    const query = {};

    // Exclude students by default - only show admin and tutor
    // If role is explicitly provided, use it (including students if requested)
    if (role && ["student", "admin", "tutor"].includes(role)) {
      query.role = role;
    } else {
      // Default: exclude students, show only admin and tutor
      query.role = { $in: ["admin", "tutor"] };
    }

    // Filter by status if provided
    if (status && ["active", "blocked"].includes(status)) {
      query.status = status;
    }

    // Search by name or email
    if (q) {
      query.$or = [
        { name: { $regex: String(q), $options: "i" } },
        { email: { $regex: String(q), $options: "i" } },
        { phone: { $regex: String(q), $options: "i" } },
      ];
    }

    const items = await UserModel.find(query)
      .select("-passwordHash -otp")
      .sort({ createdAt: -1 });

    res.json({
      items,
      total: items.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// **GET** a single user by ID (admin only)
router.get("/:userId", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await UserModel.findById(userId).select("-passwordHash -otp");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid User ID" });
    }
    res.status(500).json({ error: error.message });
  }
});

// **CREATE** a new user with admin or tutor role (admin only)
router.post("/", requireAdmin, async (req, res) => {
  try {
    const { name, email, phone, password, role, status } = req.body;

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({
        error: "Name and email are required fields",
      });
    }

    // Validate role - admin can only create admin or tutor roles
    // Students sign up themselves, so they shouldn't be created here
    if (!role || !["admin", "tutor"].includes(role)) {
      return res.status(400).json({
        error:
          "Role must be either 'admin' or 'tutor'. Students sign up themselves.",
      });
    }

    // Check if user with email already exists
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        error: "User with this email already exists",
      });
    }

    // Check if phone number is provided and if it already exists (regardless of role)
    if (phone) {
      const { normalizePhoneNumber } = require("../services/sms.service");
      const normalizedPhone = normalizePhoneNumber(phone);

      // Check with normalized phone first
      let existingUserWithPhone = await UserModel.findOne({
        phone: normalizedPhone,
      });

      // If not found, check with alternative phone formats
      // This handles cases where user was created before normalization or with different format
      if (!existingUserWithPhone) {
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

        existingUserWithPhone = await UserModel.findOne({
          phone: { $in: uniquePhones },
        });
      }

      if (existingUserWithPhone) {
        return res.status(409).json({
          error: `Phone number already exists for a ${existingUserWithPhone.role} account. Phone numbers must be unique across all roles.`,
        });
      }
    }

    // Hash password if provided
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    // Create user
    let normalizedPhone = undefined;
    if (phone) {
      const { normalizePhoneNumber } = require("../services/sms.service");
      normalizedPhone = normalizePhoneNumber(phone);
    }

    const user = await UserModel.create({
      name,
      email,
      phone: normalizedPhone,
      passwordHash,
      role,
      status: status || "active",
    });

    // Return user without sensitive data
    const userResponse = user.toObject();
    delete userResponse.passwordHash;
    delete userResponse.otp;

    // Create notification and send email for admin/tutor creation
    try {
      const currentUser = await UserModel.findById(req.user.id).select(
        "name email"
      );
      if (currentUser) {
        // Create notification for both admin and tutor
        try {
          const notificationResult = await notifyAdminChange(
            "create",
            user,
            req.user.id,
            currentUser.name || currentUser.email || "Unknown User"
          );

          if (notificationResult) {
            console.log("Notification created successfully:", {
              type: notificationResult.type,
              action: notificationResult.action,
              entityName: notificationResult.entityName,
            });
          } else {
            console.warn(
              "Notification creation returned null - check notification service logs"
            );
          }
        } catch (notifError) {
          console.error("Error creating notification:", notifError);
          console.error("Notification error details:", {
            message: notifError.message,
            stack: notifError.stack,
            user: user._id,
            role: user.role,
          });
        }

        // Send welcome email only for admin creation
        if (role === "admin") {
          try {
            const emailResult = await sendAdminAccountCreatedEmail(
              user,
              password || null, // Only send password if it was provided
              currentUser
            );
            if (!emailResult.success) {
              console.error(
                "Failed to send admin account creation email:",
                emailResult.error
              );
              // Don't fail the request if email fails
            }
          } catch (emailError) {
            console.error(
              "Error sending admin account creation email:",
              emailError
            );
            // Don't fail the request if email fails
          }
        }
      } else {
        console.warn(
          "Current user not found for notification creation:",
          req.user.id
        );
      }
    } catch (error) {
      console.error("Error in notification/email creation block:", error);
      // Don't fail the request if notification/email fails
    }

    res.status(201).json({
      message: "User created successfully",
      user: userResponse,
    });
  } catch (error) {
    // Handle duplicate phone number error
    if (error.code === 11000 && error.keyPattern?.phone) {
      return res.status(409).json({
        error:
          "Phone number already exists. Phone numbers must be unique across all roles.",
      });
    }
    // Handle duplicate email error
    if (error.code === 11000 && error.keyPattern?.email) {
      return res.status(409).json({
        error: "Email already exists.",
      });
    }
    res.status(400).json({ error: error.message });
  }
});

// **UPDATE** a user (admin only)
router.put("/:userId", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, email, phone, password, role, status } = req.body;

    // Find user
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Prevent self-role change (admin cannot change their own role)
    if (String(userId) === String(req.user.id) && role && role !== user.role) {
      return res.status(403).json({
        error: "You cannot change your own role",
      });
    }

    // Update fields
    if (name !== undefined) user.name = name;
    if (email !== undefined) {
      // Check if email already exists for another user
      const existingUserWithEmail = await UserModel.findOne({
        email: email,
        _id: { $ne: userId },
      });
      if (existingUserWithEmail) {
        return res.status(409).json({
          error: "Email already exists for another user.",
        });
      }
      user.email = email;
    }
    if (phone !== undefined) {
      // Check if phone number already exists for another user (regardless of role)
      const { normalizePhoneNumber } = require("../services/sms.service");
      const normalizedPhone = normalizePhoneNumber(phone);

      // Check with normalized phone first
      let existingUserWithPhone = await UserModel.findOne({
        phone: normalizedPhone,
        _id: { $ne: userId }, // Exclude current user
      });

      // If not found, check with alternative phone formats
      if (!existingUserWithPhone) {
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

        existingUserWithPhone = await UserModel.findOne({
          phone: { $in: uniquePhones },
          _id: { $ne: userId }, // Exclude current user
        });
      }

      if (existingUserWithPhone) {
        return res.status(409).json({
          error: `Phone number already exists for a ${existingUserWithPhone.role} account. Phone numbers must be unique across all roles.`,
        });
      }

      // Normalize and set phone
      user.phone = normalizedPhone;
    }
    if (role !== undefined) {
      // Validate role
      if (!["student", "admin", "tutor"].includes(role)) {
        return res.status(400).json({
          error: "Role must be 'student', 'admin', or 'tutor'",
        });
      }
      user.role = role;
    }
    if (status !== undefined) {
      // Validate status
      if (!["active", "blocked"].includes(status)) {
        return res.status(400).json({
          error: "Status must be 'active' or 'blocked'",
        });
      }
      user.status = status;
    }

    // Update password if provided
    if (password) {
      user.passwordHash = await bcrypt.hash(password, 10);
    }

    await user.save();

    // Return user without sensitive data
    const userResponse = user.toObject();
    delete userResponse.passwordHash;
    delete userResponse.otp;

    // Create notification for admin/tutor update
    if (user.role === "admin" || user.role === "tutor") {
      try {
        const currentUser = await UserModel.findById(req.user.id).select(
          "name email"
        );
        if (currentUser) {
          await notifyAdminChange(
            "update",
            user,
            req.user.id,
            currentUser.name || currentUser.email || "Unknown User"
          );
        }
      } catch (notifError) {
        console.error("Error creating notification:", notifError);
      }
    }

    res.json({
      message: "User updated successfully",
      user: userResponse,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid User ID" });
    }
    // Handle duplicate phone number error
    if (error.code === 11000 && error.keyPattern?.phone) {
      return res.status(409).json({
        error:
          "Phone number already exists. Phone numbers must be unique across all roles.",
      });
    }
    // Handle duplicate email error
    if (error.code === 11000 && error.keyPattern?.email) {
      return res.status(409).json({
        error: "Email already exists.",
      });
    }
    res.status(400).json({ error: error.message });
  }
});

// **DELETE** a user (admin only)
// - Soft delete (default): Blocks students and tutors
// - Hard delete: Permanently deletes admin users (with restrictions)
router.delete("/:userId", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { hard = "false" } = req.query; // Query parameter for hard delete

    // Prevent self-deletion (both soft and hard)
    if (String(userId) === String(req.user.id)) {
      return res.status(403).json({
        error: "You cannot delete your own account",
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Hard delete logic (for admin and tutor users)
    if (hard === "true") {
      // Only admins and tutors can be hard deleted (not students)
      if (user.role === "student") {
        return res.status(403).json({
          error:
            "Hard delete is not allowed for student users. Use soft delete (block) for students.",
        });
      }

      // If deleting an admin, ensure at least one admin remains in the system
      if (user.role === "admin") {
        const adminCount = await UserModel.countDocuments({
          role: "admin",
          status: "active",
        });

        if (adminCount <= 1) {
          return res.status(403).json({
            error:
              "Cannot delete the last admin in the system. At least one active admin must remain.",
          });
        }

        // Check if the user being deleted is active (to ensure we're not counting them)
        if (user.status === "active") {
          const remainingAdmins = await UserModel.countDocuments({
            role: "admin",
            status: "active",
            _id: { $ne: userId }, // Exclude the user being deleted
          });

          if (remainingAdmins < 1) {
            return res.status(403).json({
              error:
                "Cannot delete this admin. At least one active admin must remain in the system.",
            });
          }
        }
      }

      // Create notification for admin/tutor hard deletion (before deleting)
      try {
        const currentUser = await UserModel.findById(req.user.id).select(
          "name email"
        );
        if (currentUser) {
          await notifyAdminChange(
            "delete",
            user,
            req.user.id,
            currentUser.name || currentUser.email || "Unknown User"
          );
        }
      } catch (notifError) {
        console.error("Error creating notification:", notifError);
      }

      // Perform hard delete
      await UserModel.findByIdAndDelete(userId);

      return res.json({
        message: "User permanently deleted successfully",
        deletedUser: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
    }

    // Soft delete by blocking (default behavior for students and tutors)
    user.status = "blocked";
    await user.save();

    // Create notification for admin/tutor soft deletion (blocking)
    if (user.role === "admin" || user.role === "tutor") {
      try {
        const currentUser = await UserModel.findById(req.user.id).select(
          "name email"
        );
        if (currentUser) {
          await notifyAdminChange(
            "delete",
            user,
            req.user.id,
            currentUser.name || currentUser.email || "Unknown User"
          );
        }
      } catch (notifError) {
        console.error("Error creating notification:", notifError);
      }
    }

    res.json({
      message: "User blocked successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        status: user.status,
      },
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid User ID" });
    }
    res.status(500).json({ error: error.message });
  }
});

// **UNBLOCK** a user (admin only)
router.post("/:userId/unblock", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    user.status = "active";
    await user.save();

    // Create notification for admin/tutor unblock (restore)
    if (user.role === "admin" || user.role === "tutor") {
      try {
        const currentUser = await UserModel.findById(req.user.id).select(
          "name email"
        );
        if (currentUser) {
          await notifyAdminChange(
            "restore",
            user,
            req.user.id,
            currentUser.name || currentUser.email || "Unknown User"
          );
        }
      } catch (notifError) {
        console.error("Error creating notification:", notifError);
      }
    }

    res.json({
      message: "User unblocked successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        status: user.status,
      },
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid User ID" });
    }
    res.status(500).json({ error: error.message });
  }
});

// **LIST BLOCKED USERS** - Get all blocked (soft-deleted) users (admin only)
router.get("/blocked/list", requireAdmin, async (req, res) => {
  try {
    const { q, role, email, phone } = req.query;

    const query = { status: "blocked" }; // Only blocked users

    // Search by name
    if (q) {
      query.name = { $regex: String(q), $options: "i" };
    }

    // Filter by role
    if (role) {
      query.role = role;
    }

    // Filter by email
    if (email) {
      query.email = { $regex: String(email), $options: "i" };
    }

    // Filter by phone
    if (phone) {
      query.phone = { $regex: String(phone), $options: "i" };
    }

    const items = await UserModel.find(query)
      .select("name email phone role status createdAt updatedAt")
      .sort({ updatedAt: -1 }); // Sort by when they were blocked (most recent first)

    res.json({
      items,
      total: items.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
