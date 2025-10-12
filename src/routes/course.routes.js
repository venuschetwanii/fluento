const Router = require("express").Router;
const Course = require("../models/course.model");
const auth = require("../middlewares/auth.middleware");

const router = Router();

// Role-based guard for write operations
const requireRole =
  (...roles) =>
  (req, res, next) => {
    try {
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: "Forbidden" });
      }
      return next();
    } catch (e) {
      return res.status(403).json({ error: "Forbidden" });
    }
  };

// Open endpoints (no auth): published and non-deleted courses
router.get("/open", async (req, res) => {
  try {
    const { examType, page = 1, limit = 20 } = req.query;
    const query = { status: "published", deletedAt: null };
    if (examType) query.examType = { $regex: String(examType), $options: "i" };

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Course.find(query)
        .select(
          "title examType shortDescription status type url publishedAt createdAt"
        )
        .populate("publishedBy", "name email")
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Course.countDocuments(query),
    ]);
    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/open/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params;
    const course = await Course.findOne({
      _id: courseId,
      status: "published",
      deletedAt: null,
    })
      .select(
        "title examType description shortDescription type url publishedAt createdAt"
      )
      .populate("publishedBy", "name email");

    if (!course) return res.status(404).json({ error: "Course not found" });

    return res.json(course);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid Course ID" });
    }
    res.status(500).json({ error: error.message });
  }
});

// Protect all course routes with JWT auth
router.use(auth);

// **CREATE** a new Course
router.post(
  "/",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const {
        title,
        examType,
        description,
        shortDescription,
        status,
        type,
        url,
      } = req.body;

      if (
        !title ||
        !examType ||
        !description ||
        !shortDescription ||
        !type ||
        !url
      ) {
        return res.status(400).json({
          error:
            "Title, examType, description, shortDescription, type, and url are required fields.",
        });
      }

      // Validate material type
      if (!["video", "pdf"].includes(type)) {
        return res.status(400).json({
          error: "Type must be either 'video' or 'pdf'",
        });
      }

      // Duplicate guard: same title+examType not allowed
      const existing = await Course.findOne({
        title,
        examType,
        deletedAt: null,
      });
      if (existing) {
        return res.status(409).json({
          error: "Course with same title and exam type already exists",
        });
      }

      // Validate status
      const validStatus = status === "published" ? "published" : "draft";

      const course = await Course.create({
        publishedBy: req.user.id,
        status: validStatus,
        title,
        examType,
        description,
        shortDescription,
        type,
        url,
      });

      // Populate the publishedBy field for response
      await course.populate("publishedBy", "name email");

      return res.status(201).json(course);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
);

// **READ** all Courses (list view)
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      q,
      examType,
      status,
      includeDeleted = false,
    } = req.query;

    const query = { deletedAt: null }; // Exclude soft-deleted by default
    if (includeDeleted === "true" && req.user?.role !== "student") {
      delete query.deletedAt; // Show all including deleted for non-students
    }

    if (q) query.title = { $regex: String(q), $options: "i" };
    if (examType) query.examType = { $regex: String(examType), $options: "i" };

    // Students only see published by default
    if (req.user?.role === "student") {
      query.status = "published";
    } else if (status) {
      query.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Course.find(query)
        .select(
          "title examType shortDescription status type url publishedAt deletedAt createdAt"
        )
        .populate("publishedBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Course.countDocuments(query),
    ]);

    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// **READ** a single Course with full details
router.get("/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params;

    // Find the Course document (exclude soft-deleted)
    const course = await Course.findOne({
      _id: courseId,
      deletedAt: null,
    }).populate("publishedBy", "name email");

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Students can only see published courses
    if (req.user?.role === "student" && course.status !== "published") {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json(course);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid Course ID" });
    }
    res.status(500).json({ error: error.message });
  }
});

// **UPDATE** a Course
router.put(
  "/:courseId",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { courseId } = req.params;

      // Check if course exists and user has permission
      const existingCourse = await Course.findOne({
        _id: courseId,
        deletedAt: null,
      });

      if (!existingCourse) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Only allow course owner, moderators, or admins to update
      if (
        String(existingCourse.publishedBy) !== String(req.user.id) &&
        !["moderator", "admin"].includes(req.user.role)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Validate status if provided
      if (
        req.body.status &&
        !["draft", "published"].includes(req.body.status)
      ) {
        return res.status(400).json({
          error: "Status must be either 'draft' or 'published'",
        });
      }

      // Validate type if provided
      if (req.body.type && !["video", "pdf"].includes(req.body.type)) {
        return res.status(400).json({
          error: "Type must be either 'video' or 'pdf'",
        });
      }

      const updatedCourse = await Course.findByIdAndUpdate(courseId, req.body, {
        new: true, // Return the updated document
        runValidators: true, // Run schema validators
      }).populate("publishedBy", "name email");

      res.json(updatedCourse);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// **UPDATE COURSE STATUS** - Dedicated endpoint for status updates
router.patch(
  "/:courseId/status",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { courseId } = req.params;
      const { status } = req.body;

      // Validate status value
      if (!status || !["draft", "published"].includes(status)) {
        return res.status(400).json({
          error: "Status is required and must be either 'draft' or 'published'",
        });
      }

      // Find the course (exclude soft-deleted)
      const course = await Course.findOne({ _id: courseId, deletedAt: null });
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Only allow course owner, moderators, or admins to update status
      if (
        String(course.publishedBy) !== String(req.user.id) &&
        !["moderator", "admin"].includes(req.user.role)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Update only the status field
      course.status = status;
      await course.save();

      // Populate for response
      await course.populate("publishedBy", "name email");

      res.json({
        message: "Course status updated successfully",
        course: {
          _id: course._id,
          title: course.title,
          status: course.status,
          publishedAt: course.publishedAt,
          updatedAt: course.updatedAt,
        },
      });
    } catch (error) {
      if (error.name === "CastError") {
        return res.status(400).json({ error: "Invalid Course ID" });
      }
      res.status(500).json({ error: error.message });
    }
  }
);

// **SOFT DELETE** a Course
router.delete(
  "/:courseId",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { courseId } = req.params;

      const course = await Course.findOne({ _id: courseId, deletedAt: null });
      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Only allow course owner, moderators, or admins to delete
      if (
        String(course.publishedBy) !== String(req.user.id) &&
        !["moderator", "admin"].includes(req.user.role)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Soft delete: set deletedAt timestamp
      course.deletedAt = new Date();
      await course.save();

      res.status(200).json({
        message: "Course soft deleted successfully.",
        deletedAt: course.deletedAt,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// **RESTORE** a soft-deleted Course
router.post(
  "/:courseId/restore",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { courseId } = req.params;

      const course = await Course.findOne({
        _id: courseId,
        deletedAt: { $ne: null },
      });
      if (!course) {
        return res.status(404).json({ error: "Soft-deleted course not found" });
      }

      // Only allow course owner, moderators, or admins to restore
      if (
        String(course.publishedBy) !== String(req.user.id) &&
        !["moderator", "admin"].includes(req.user.role)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      course.deletedAt = null;
      await course.save();

      res.status(200).json({
        message: "Course restored successfully.",
        course: {
          _id: course._id,
          title: course.title,
          status: course.status,
        },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// **HARD DELETE** a Course (permanent removal)
router.delete("/:courseId/hard", requireRole("admin"), async (req, res) => {
  try {
    const { courseId } = req.params;

    const courseToDelete = await Course.findById(courseId);
    if (!courseToDelete) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Delete the course permanently
    await Course.findByIdAndDelete(courseId);

    res.status(200).json({
      message: "Course permanently deleted.",
      deletedCourse: {
        _id: courseToDelete._id,
        title: courseToDelete.title,
        examType: courseToDelete.examType,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
