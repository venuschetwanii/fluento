const Router = require("express").Router;
const InquiryModel = require("../models/inquiry.model");
const auth = require("../middlewares/auth.middleware");

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

// **CREATE** a new inquiry (public endpoint - no auth required)
router.post("/", async (req, res) => {
  try {
    const { title, type, name, phone, email, message } = req.body;

    // Validate required fields
    if (!title || !name || !email || !message) {
      return res.status(400).json({
        error: "Title, name, email, and message are required fields",
      });
    }

    // Validate type if provided
    if (type && !["support", "feedback", "complaint", "general"].includes(type)) {
      return res.status(400).json({
        error: "Invalid inquiry type. Must be: support, feedback, complaint, or general",
      });
    }

    // Create inquiry
    const inquiry = await InquiryModel.create({
      title,
      type: type || "general",
      name,
      phone: phone || undefined,
      email,
      message,
      status: "pending",
    });

    res.status(201).json({
      message: "Inquiry created successfully",
      inquiry: {
        _id: inquiry._id,
        title: inquiry.title,
        type: inquiry.type,
        name: inquiry.name,
        phone: inquiry.phone,
        email: inquiry.email,
        message: inquiry.message,
        status: inquiry.status,
        createdAt: inquiry.createdAt,
        updatedAt: inquiry.updatedAt,
      },
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Protect all inquiry management routes with JWT auth (admin only)
router.use(auth);
router.use(requireAdmin);

// **LIST** all inquiries with pagination, search, and filter (admin only)
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      type,
      q,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    // Filter by status if provided
    if (status && ["pending", "in_progress", "resolved", "closed"].includes(status)) {
      query.status = status;
    }

    // Filter by type if provided
    if (type && ["support", "feedback", "complaint", "general"].includes(type)) {
      query.type = type;
    }

    // Search by title, name, email, or message
    if (q) {
      query.$or = [
        { title: { $regex: String(q), $options: "i" } },
        { name: { $regex: String(q), $options: "i" } },
        { email: { $regex: String(q), $options: "i" } },
        { message: { $regex: String(q), $options: "i" } },
      ];
    }

    // Build sort object
    const sortField = sortBy || "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    const sort = { [sortField]: sortDirection };

    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Fetch inquiries with pagination
    const [items, total] = await Promise.all([
      InquiryModel.find(query)
        .select("title type name phone email message status createdAt updatedAt")
        .sort(sort)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      InquiryModel.countDocuments(query),
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

// **GET** a single inquiry by ID (admin only)
router.get("/:inquiryId", async (req, res) => {
  try {
    const { inquiryId } = req.params;
    const inquiry = await InquiryModel.findById(inquiryId);

    if (!inquiry) {
      return res.status(404).json({ error: "Inquiry not found" });
    }

    res.json(inquiry);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid Inquiry ID" });
    }
    res.status(500).json({ error: error.message });
  }
});

// **UPDATE** an inquiry (admin only)
router.put("/:inquiryId", async (req, res) => {
  try {
    const { inquiryId } = req.params;
    const { title, type, name, phone, email, message, status } = req.body;

    const inquiry = await InquiryModel.findById(inquiryId);
    if (!inquiry) {
      return res.status(404).json({ error: "Inquiry not found" });
    }

    // Update fields if provided
    if (title !== undefined) inquiry.title = title;
    if (type !== undefined) {
      if (!["support", "feedback", "complaint", "general"].includes(type)) {
        return res.status(400).json({ error: "Invalid inquiry type" });
      }
      inquiry.type = type;
    }
    if (name !== undefined) inquiry.name = name;
    if (phone !== undefined) inquiry.phone = phone;
    if (email !== undefined) inquiry.email = email;
    if (message !== undefined) inquiry.message = message;
    if (status !== undefined) {
      if (!["pending", "in_progress", "resolved", "closed"].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      inquiry.status = status;
    }

    await inquiry.save();

    res.json({
      message: "Inquiry updated successfully",
      inquiry,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid Inquiry ID" });
    }
    res.status(400).json({ error: error.message });
  }
});

// **DELETE** an inquiry (admin only)
router.delete("/:inquiryId", async (req, res) => {
  try {
    const { inquiryId } = req.params;

    const inquiry = await InquiryModel.findByIdAndDelete(inquiryId);
    if (!inquiry) {
      return res.status(404).json({ error: "Inquiry not found" });
    }

    res.json({
      message: "Inquiry deleted successfully",
      deletedInquiry: {
        _id: inquiry._id,
        title: inquiry.title,
        type: inquiry.type,
      },
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid Inquiry ID" });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

