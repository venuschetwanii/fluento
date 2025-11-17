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
  requireRole("tutor", "admin"),
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

      // Only allow course owner (tutor) or admins to add lessons
      // Tutors can only edit their own courses, admins can edit all
      if (
        String(courseDoc.createdBy) !== String(req.user.id) &&
        req.user.role !== "admin"
      ) {
        return res.status(403).json({ error: "Forbidden: You can only edit courses created by you" });
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

    const items = await Lesson.find({ course: courseId, deletedAt: null })
      .select(
        "title description type duration url thumbnail publishedAt order"
      )
      .populate("course", "title examType")
      .sort({ order: 1 });

    res.json({ items, total: items.length });
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

    const items = await Lesson.find(query)
      .select(
        "title description type duration url thumbnail publishedAt order deletedAt createdAt"
      )
      .populate("course", "title examType status")
      .sort({ createdAt: -1 });

    res.json({ items, total: items.length });
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
  requireRole("tutor", "admin"),
  async (req, res) => {
    try {
      const { lessonId } = req.params;

      // Check if lesson exists and user has permission
      const existingLesson = await Lesson.findOne({
        _id: lessonId,
        deletedAt: null,
      }).populate("course", "createdBy");

      if (!existingLesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      // Only allow course owner (tutor) or admins to update
      // Tutors can only edit their own courses, admins can edit all
      if (
        String(existingLesson.course.createdBy) !== String(req.user.id) &&
        req.user.role !== "admin"
      ) {
        return res.status(403).json({ error: "Forbidden: You can only edit courses created by you" });
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
  requireRole("tutor", "admin"),
  async (req, res) => {
    try {
      const { lessonId } = req.params;

      const lesson = await Lesson.findOne({
        _id: lessonId,
        deletedAt: null,
      }).populate("course", "createdBy");

      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      // Only allow course owner (tutor) or admins to delete
      // Tutors can only edit their own courses, admins can edit all
      if (
        String(lesson.course.createdBy) !== String(req.user.id) &&
        req.user.role !== "admin"
      ) {
        return res.status(403).json({ error: "Forbidden: You can only edit courses created by you" });
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
  requireRole("tutor", "admin"),
  async (req, res) => {
    try {
      const { lessonId } = req.params;

      const lesson = await Lesson.findOne({
        _id: lessonId,
        deletedAt: { $ne: null },
      }).populate("course", "createdBy");

      if (!lesson) {
        return res.status(404).json({ error: "Soft-deleted lesson not found" });
      }

      // Only allow course owner (tutor) or admins to restore
      // Tutors can only edit their own courses, admins can edit all
      if (
        String(lesson.course.createdBy) !== String(req.user.id) &&
        req.user.role !== "admin"
      ) {
        return res.status(403).json({ error: "Forbidden: You can only edit courses created by you" });
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

// **LIST SOFT DELETED LESSONS** - Get all soft-deleted lessons
router.get("/deleted/list", requireRole("tutor", "admin"), async (req, res) => {
  try {
    const { q, course, type, status } = req.query;

    const query = { deletedAt: { $ne: null } }; // Only soft-deleted lessons

    // Search by title
    if (q) {
      query.title = { $regex: String(q), $options: "i" };
    }

    // Filter by course
    if (course) {
      query.course = course;
    }

    // Filter by type
    if (type) {
      query.type = type;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Tutors can only see their own deleted lessons, admins can see all
    if (req.user?.role === "tutor") {
      // Get courses created by this tutor
      const tutorCourses = await Course.find({ createdBy: req.user.id }).select("_id");
      const courseIds = tutorCourses.map((c) => c._id);
      query.course = { $in: courseIds };
    }

    const items = await Lesson.find(query)
      .select("title description type duration url thumbnail publishedAt order deletedAt course createdAt")
      .populate("course", "title examType")
      .sort({ deletedAt: -1 }); // Sort by deletion date (most recent first)

    res.json({
      items,
      total: items.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
