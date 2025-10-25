const Router = require("express").Router;
const Lesson = require("../models/lesson.model");
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

// Protect all lesson routes with JWT auth
router.use(auth);

// **CREATE** a new Lesson
router.post(
  "/",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const {
        title,
        description,
        type,
        duration,
        url,
        thumbnail,
        publishedAt,
        course,
        order,
      } = req.body;

      if (!title || !description || !type || !duration || !url || !course) {
        return res.status(400).json({
          error:
            "Title, description, type, duration, url, and course are required fields.",
        });
      }

      // Validate lesson type
      if (!["video", "pdf"].includes(type)) {
        return res.status(400).json({
          error: "Type must be either 'video' or 'pdf'",
        });
      }

      // Check if course exists and user has permission
      const courseDoc = await Course.findOne({
        _id: course,
        deletedAt: null,
      });

      if (!courseDoc) {
        return res.status(404).json({ error: "Course not found" });
      }

      // Only allow course owner, moderators, or admins to add lessons
      if (
        String(courseDoc.publishedBy) !== String(req.user.id) &&
        !["moderator", "admin"].includes(req.user.role)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Get the next order number if not provided
      let lessonOrder = order;
      if (!lessonOrder) {
        const lastLesson = await Lesson.findOne(
          { course, deletedAt: null },
          {},
          { sort: { order: -1 } }
        );
        lessonOrder = lastLesson ? lastLesson.order + 1 : 1;
      }

      const lesson = await Lesson.create({
        title,
        description,
        type,
        duration,
        url,
        thumbnail,
        publishedAt: publishedAt || new Date(),
        course,
        order: lessonOrder,
      });

      // Populate the course field for response
      await lesson.populate("course", "title examType");

      return res.status(201).json(lesson);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
);

// **READ** all Lessons for a specific course
router.get("/course/:courseId", async (req, res) => {
  try {
    const { courseId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Check if course exists
    const course = await Course.findOne({
      _id: courseId,
      deletedAt: null,
    });

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Students can only see lessons from published courses
    if (req.user?.role === "student" && course.status !== "published") {
      return res.status(403).json({ error: "Access denied" });
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Lesson.find({ course: courseId, deletedAt: null })
        .select(
          "title description type duration url thumbnail publishedAt order"
        )
        .populate("course", "title examType")
        .sort({ order: 1 })
        .skip(skip)
        .limit(Number(limit)),
      Lesson.countDocuments({ course: courseId, deletedAt: null }),
    ]);

    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid Course ID" });
    }
    res.status(500).json({ error: error.message });
  }
});

// **READ** all Lessons (list view)
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      q,
      type,
      course,
      includeDeleted = false,
    } = req.query;

    const query = { deletedAt: null }; // Exclude soft-deleted by default
    if (includeDeleted === "true" && req.user?.role !== "student") {
      delete query.deletedAt; // Show all including deleted for non-students
    }

    if (q) query.title = { $regex: String(q), $options: "i" };
    if (type) query.type = type;
    if (course) query.course = course;

    // Students only see lessons from published courses
    if (req.user?.role === "student") {
      const publishedCourses = await Course.find(
        { status: "published", deletedAt: null },
        { _id: 1 }
      );
      query.course = { $in: publishedCourses.map((c) => c._id) };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Lesson.find(query)
        .select(
          "title description type duration url thumbnail publishedAt order deletedAt createdAt"
        )
        .populate("course", "title examType status")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Lesson.countDocuments(query),
    ]);

    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// **READ** a single Lesson with full details
router.get("/:lessonId", async (req, res) => {
  try {
    const { lessonId } = req.params;

    // Find the Lesson document (exclude soft-deleted)
    const lesson = await Lesson.findOne({
      _id: lessonId,
      deletedAt: null,
    }).populate("course", "title examType status publishedBy");

    if (!lesson) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    // Students can only see lessons from published courses
    if (req.user?.role === "student" && lesson.course.status !== "published") {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json(lesson);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid Lesson ID" });
    }
    res.status(500).json({ error: error.message });
  }
});

// **UPDATE** a Lesson
router.put(
  "/:lessonId",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { lessonId } = req.params;

      // Check if lesson exists and user has permission
      const existingLesson = await Lesson.findOne({
        _id: lessonId,
        deletedAt: null,
      }).populate("course", "publishedBy");

      if (!existingLesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      // Only allow course owner, moderators, or admins to update
      if (
        String(existingLesson.course.publishedBy) !== String(req.user.id) &&
        !["moderator", "admin"].includes(req.user.role)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Validate type if provided
      if (req.body.type && !["video", "pdf"].includes(req.body.type)) {
        return res.status(400).json({
          error: "Type must be either 'video' or 'pdf'",
        });
      }

      const updatedLesson = await Lesson.findByIdAndUpdate(lessonId, req.body, {
        new: true, // Return the updated document
        runValidators: true, // Run schema validators
      }).populate("course", "title examType");

      res.json(updatedLesson);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// **SOFT DELETE** a Lesson
router.delete(
  "/:lessonId",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { lessonId } = req.params;

      const lesson = await Lesson.findOne({
        _id: lessonId,
        deletedAt: null,
      }).populate("course", "publishedBy");

      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      // Only allow course owner, moderators, or admins to delete
      if (
        String(lesson.course.publishedBy) !== String(req.user.id) &&
        !["moderator", "admin"].includes(req.user.role)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // Soft delete: set deletedAt timestamp
      lesson.deletedAt = new Date();
      await lesson.save();

      res.status(200).json({
        message: "Lesson soft deleted successfully.",
        deletedAt: lesson.deletedAt,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// **RESTORE** a soft-deleted Lesson
router.post(
  "/:lessonId/restore",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { lessonId } = req.params;

      const lesson = await Lesson.findOne({
        _id: lessonId,
        deletedAt: { $ne: null },
      }).populate("course", "publishedBy");

      if (!lesson) {
        return res.status(404).json({ error: "Soft-deleted lesson not found" });
      }

      // Only allow course owner, moderators, or admins to restore
      if (
        String(lesson.course.publishedBy) !== String(req.user.id) &&
        !["moderator", "admin"].includes(req.user.role)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      lesson.deletedAt = null;
      await lesson.save();

      res.status(200).json({
        message: "Lesson restored successfully.",
        lesson: {
          _id: lesson._id,
          title: lesson.title,
          course: lesson.course.title,
        },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// **HARD DELETE** a Lesson (permanent removal)
router.delete("/:lessonId/hard", requireRole("admin"), async (req, res) => {
  try {
    const { lessonId } = req.params;

    const lessonToDelete = await Lesson.findById(lessonId);
    if (!lessonToDelete) {
      return res.status(404).json({ error: "Lesson not found" });
    }

    // Delete the lesson permanently
    await Lesson.findByIdAndDelete(lessonId);

    res.status(200).json({
      message: "Lesson permanently deleted.",
      deletedLesson: {
        _id: lessonToDelete._id,
        title: lessonToDelete.title,
        course: lessonToDelete.course,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
