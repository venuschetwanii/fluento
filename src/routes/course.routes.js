const Router = require("express").Router;
const Course = require("../models/course.model");
const Lesson = require("../models/lesson.model");
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
    const { examType, category, page = 1, limit = 20 } = req.query;
    const query = { status: "published", deletedAt: null };
    if (examType) query.examType = { $regex: String(examType), $options: "i" };
    if (category) query.category = { $regex: String(category), $options: "i" };

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Course.find(query)
        .select(
          "title examType description thumbnail category studentsCount status publishedAt createdAt"
        )
        .populate("publishedBy", "name email")
        .populate({
          path: "lessons",
          select:
            "title description type duration url thumbnail publishedAt order",
          match: { deletedAt: null },
          options: { sort: { order: 1 } },
        })
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
        "title examType description thumbnail category studentsCount status publishedAt createdAt"
      )
      .populate("publishedBy", "name email")
      .populate({
        path: "lessons",
        select:
          "title description type duration url thumbnail publishedAt order",
        match: { deletedAt: null },
        options: { sort: { order: 1 } },
      });

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
        thumbnail,
        category,
        studentsCount,
        status,
        lessons = [],
      } = req.body;

      if (!title || !examType || !description || !category) {
        return res.status(400).json({
          error:
            "Title, examType, description, and category are required fields.",
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
        thumbnail,
        category,
        studentsCount: studentsCount || 0,
      });

      // Create lessons if provided
      if (lessons && lessons.length > 0) {
        const lessonPromises = lessons.map((lesson, index) => {
          return Lesson.create({
            title: lesson.title,
            description: lesson.description,
            type: lesson.type,
            duration: lesson.duration,
            url: lesson.url,
            thumbnail: lesson.thumbnail,
            publishedAt: lesson.publishedAt || new Date(),
            course: course._id,
            order: lesson.order || index + 1,
          });
        });
        await Promise.all(lessonPromises);
      }

      // Populate the course with lessons and publishedBy
      await course.populate("publishedBy", "name email");
      await course.populate({
        path: "lessons",
        select:
          "title description type duration url thumbnail publishedAt order",
        match: { deletedAt: null },
        options: { sort: { order: 1 } },
      });

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
      category,
      status,
      includeDeleted = false,
    } = req.query;

    const query = { deletedAt: null }; // Exclude soft-deleted by default
    if (includeDeleted === "true" && req.user?.role !== "student") {
      delete query.deletedAt; // Show all including deleted for non-students
    }

    if (q) query.title = { $regex: String(q), $options: "i" };
    if (examType) query.examType = { $regex: String(examType), $options: "i" };
    if (category) query.category = { $regex: String(category), $options: "i" };

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
          "title examType description thumbnail category studentsCount status publishedAt deletedAt createdAt"
        )
        .populate("publishedBy", "name email")
        .populate({
          path: "lessons",
          select:
            "title description type duration url thumbnail publishedAt order",
          match: { deletedAt: null },
          options: { sort: { order: 1 } },
        })
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
    })
      .populate("publishedBy", "name email")
      .populate({
        path: "lessons",
        select:
          "title description type duration url thumbnail publishedAt order",
        match: { deletedAt: null },
        options: { sort: { order: 1 } },
      });

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
      const { lessons, ...courseData } = req.body;

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
        courseData.status &&
        !["draft", "published"].includes(courseData.status)
      ) {
        return res.status(400).json({
          error: "Status must be either 'draft' or 'published'",
        });
      }

      // Update course data
      const updatedCourse = await Course.findByIdAndUpdate(
        courseId,
        courseData,
        {
          new: true, // Return the updated document
          runValidators: true, // Run schema validators
        }
      );

      // Handle lessons update if provided
      if (lessons && Array.isArray(lessons)) {
        // Soft delete existing lessons
        await Lesson.updateMany(
          { course: courseId, deletedAt: null },
          { deletedAt: new Date() }
        );

        // Create new lessons
        if (lessons.length > 0) {
          const lessonPromises = lessons.map((lesson, index) => {
            return Lesson.create({
              title: lesson.title,
              description: lesson.description,
              type: lesson.type,
              duration: lesson.duration,
              url: lesson.url,
              thumbnail: lesson.thumbnail,
              publishedAt: lesson.publishedAt || new Date(),
              course: courseId,
              order: lesson.order || index + 1,
            });
          });
          await Promise.all(lessonPromises);
        }
      }

      // Populate the updated course
      await updatedCourse.populate("publishedBy", "name email");
      await updatedCourse.populate({
        path: "lessons",
        select:
          "title description type duration url thumbnail publishedAt order",
        match: { deletedAt: null },
        options: { sort: { order: 1 } },
      });

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

      // Also soft delete all associated lessons
      await Lesson.updateMany(
        { course: courseId, deletedAt: null },
        { deletedAt: new Date() }
      );

      res.status(200).json({
        message: "Course and associated lessons soft deleted successfully.",
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

      // Also restore all associated lessons
      await Lesson.updateMany(
        { course: courseId, deletedAt: { $ne: null } },
        { deletedAt: null }
      );

      res.status(200).json({
        message: "Course and associated lessons restored successfully.",
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

    // Delete all associated lessons permanently first
    await Lesson.deleteMany({ course: courseId });

    // Delete the course permanently
    await Course.findByIdAndDelete(courseId);

    res.status(200).json({
      message: "Course and associated lessons permanently deleted.",
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
