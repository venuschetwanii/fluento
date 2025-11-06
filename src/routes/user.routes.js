const Router = require("express").Router;
const bcrypt = require("bcryptjs");
const UserModel = require("../models/user.model");
const auth = require("../middlewares/auth.middleware");

const router = Router();

// Role-based guard for admin-only operations
const requireAdmin = (req, res, next) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "Forbidden: Admin access required" });
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
      return res.status(403).json({ error: "Forbidden: Admin or tutor access required" });
    }
    return next();
  } catch (e) {
    return res.status(403).json({ error: "Forbidden" });
  }
};

// Protect all user management routes with JWT auth
router.use(auth);

// **LIST** all students (admin and tutor access)
router.get("/students", requireAdminOrTutor, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, q, sortBy = "createdAt", sortOrder = "desc" } = req.query;

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

    // Validate sortBy and sortOrder
    const validSortFields = ["name", "email", "createdAt", "updatedAt"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      UserModel.find(query)
        .select("-passwordHash -otp")
        .sort({ [sortField]: sortDirection })
        .skip(skip)
        .limit(Number(limit)),
      UserModel.countDocuments(query),
    ]);

    res.json({
      items,
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
    const { page = 1, limit = 20, role, status, q } = req.query;

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

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      UserModel.find(query)
        .select("-passwordHash -otp")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      UserModel.countDocuments(query),
    ]);

    res.json({
      items,
      total,
      page: Number(page),
      limit: Number(limit),
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
        error: "Role must be either 'admin' or 'tutor'. Students sign up themselves.",
      });
    }

    // Check if user with email already exists
    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        error: "User with this email already exists",
      });
    }

    // Hash password if provided
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    // Create user
    const user = await UserModel.create({
      name,
      email,
      phone: phone || undefined,
      passwordHash,
      role,
      status: status || "active",
    });

    // Return user without sensitive data
    const userResponse = user.toObject();
    delete userResponse.passwordHash;
    delete userResponse.otp;

    res.status(201).json({
      message: "User created successfully",
      user: userResponse,
    });
  } catch (error) {
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
    if (email !== undefined) user.email = email;
    if (phone !== undefined) user.phone = phone;
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

    res.json({
      message: "User updated successfully",
      user: userResponse,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid User ID" });
    }
    res.status(400).json({ error: error.message });
  }
});

// **DELETE** a user (admin only) - soft delete by blocking
router.delete("/:userId", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent self-deletion
    if (String(userId) === String(req.user.id)) {
      return res.status(403).json({
        error: "You cannot delete your own account",
      });
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Soft delete by blocking the user
    user.status = "blocked";
    await user.save();

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

module.exports = router;

