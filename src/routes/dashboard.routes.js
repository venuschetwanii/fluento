const Router = require("express").Router;
const UserModel = require("../models/user.model");
const ExamModel = require("../models/exam.model");
const CourseModel = require("../models/course.model");
const AttemptModel = require("../models/attempt.model");
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

// Protect all dashboard routes with JWT auth
router.use(auth);

// **DASHBOARD OVERVIEW** - Get all dashboard statistics
router.get("/overview", requireAdmin, async (req, res) => {
  try {
    // Get all statistics in parallel for better performance
    const [
      totalStudents,
      totalPublishedExams,
      totalPublishedCourses,
      totalAttempts,
      monthWiseAttempts,
      examsPerType,
    ] = await Promise.all([
      // 1. Total students (active only)
      UserModel.countDocuments({ role: "student", status: "active" }),

      // 2. Total published exams (excluding deleted)
      ExamModel.countDocuments({ status: "published", deletedAt: null }),

      // 3. Total published courses (excluding deleted)
      CourseModel.countDocuments({ status: "published", deletedAt: null }),

      // 4. Total attempts given
      AttemptModel.countDocuments({}),

      // 5. Month-wise attempts given
      AttemptModel.aggregate([
        {
          $group: {
            _id: {
              year: { $year: "$createdAt" },
              month: { $month: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
        {
          $sort: { "_id.year": -1, "_id.month": -1 },
        },
        {
          $project: {
            _id: 0,
            year: "$_id.year",
            month: "$_id.month",
            monthName: {
              $arrayElemAt: [
                [
                  "",
                  "January",
                  "February",
                  "March",
                  "April",
                  "May",
                  "June",
                  "July",
                  "August",
                  "September",
                  "October",
                  "November",
                  "December",
                ],
                "$_id.month",
              ],
            },
            count: 1,
          },
        },
      ]),

      // 6. Exams per exam type
      ExamModel.aggregate([
        {
          $match: { deletedAt: null },
        },
        {
          $group: {
            _id: "$type",
            total: { $sum: 1 },
            published: {
              $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] },
            },
            draft: {
              $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] },
            },
          },
        },
        {
          $project: {
            _id: 0,
            examType: "$_id",
            total: 1,
            published: 1,
            draft: 1,
          },
        },
        {
          $sort: { total: -1 },
        },
      ]),
    ]);

    res.json({
      overview: {
        totalStudents,
        totalPublishedExams,
        totalPublishedCourses,
        totalAttempts,
      },
      monthWiseAttempts,
      examsPerType,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// **TOTAL STUDENTS** - Get total students count
router.get("/stats/students", requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const query = { role: "student" };

    if (status && ["active", "blocked"].includes(status)) {
      query.status = status;
    }

    const total = await UserModel.countDocuments(query);
    const active = await UserModel.countDocuments({
      role: "student",
      status: "active",
    });
    const blocked = await UserModel.countDocuments({
      role: "student",
      status: "blocked",
    });

    res.json({
      total,
      active,
      blocked,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// **TOTAL PUBLISHED EXAMS** - Get total published exams count
router.get("/stats/exams", requireAdmin, async (req, res) => {
  try {
    const total = await ExamModel.countDocuments({ deletedAt: null });
    const published = await ExamModel.countDocuments({
      status: "published",
      deletedAt: null,
    });
    const draft = await ExamModel.countDocuments({
      status: "draft",
      deletedAt: null,
    });

    res.json({
      total,
      published,
      draft,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// **TOTAL PUBLISHED COURSES** - Get total published courses count
router.get("/stats/courses", requireAdmin, async (req, res) => {
  try {
    const total = await CourseModel.countDocuments({ deletedAt: null });
    const published = await CourseModel.countDocuments({
      status: "published",
      deletedAt: null,
    });
    const draft = await CourseModel.countDocuments({
      status: "draft",
      deletedAt: null,
    });

    res.json({
      total,
      published,
      draft,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// **TOTAL ATTEMPTS** - Get total attempts count
router.get("/stats/attempts", requireAdmin, async (req, res) => {
  try {
    const total = await AttemptModel.countDocuments({});
    const inProgress = await AttemptModel.countDocuments({
      status: "in_progress",
    });
    const submitted = await AttemptModel.countDocuments({
      status: "submitted",
    });
    const graded = await AttemptModel.countDocuments({ status: "graded" });
    const expired = await AttemptModel.countDocuments({ status: "expired" });
    const cancelled = await AttemptModel.countDocuments({
      status: "cancelled",
    });

    res.json({
      total,
      inProgress,
      submitted,
      graded,
      expired,
      cancelled,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// **MONTH-WISE ATTEMPTS** - Get attempts grouped by month
router.get("/stats/attempts/monthly", requireAdmin, async (req, res) => {
  try {
    const { year } = req.query;
    const matchStage = {};

    // Filter by year if provided
    if (year) {
      const yearNum = parseInt(year);
      matchStage.createdAt = {
        $gte: new Date(yearNum, 0, 1),
        $lt: new Date(yearNum + 1, 0, 1),
      };
    }

    const monthWiseAttempts = await AttemptModel.aggregate([
      ...(Object.keys(matchStage).length > 0 ? [{ $match: matchStage }] : []),
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": -1, "_id.month": -1 },
      },
      {
        $project: {
          _id: 0,
          year: "$_id.year",
          month: "$_id.month",
          monthName: {
            $arrayElemAt: [
              [
                "",
                "January",
                "February",
                "March",
                "April",
                "May",
                "June",
                "July",
                "August",
                "September",
                "October",
                "November",
                "December",
              ],
              "$_id.month",
            ],
          },
          count: 1,
        },
      },
    ]);

    res.json({
      monthWiseAttempts,
      total: monthWiseAttempts.reduce((sum, item) => sum + item.count, 0),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// **EXAMS PER EXAM TYPE** - Get exams grouped by exam type
router.get("/stats/exams/by-type", requireAdmin, async (req, res) => {
  try {
    const examsPerType = await ExamModel.aggregate([
      {
        $match: { deletedAt: null },
      },
      {
        $group: {
          _id: "$type",
          total: { $sum: 1 },
          published: {
            $sum: { $cond: [{ $eq: ["$status", "published"] }, 1, 0] },
          },
          draft: {
            $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          examType: "$_id",
          total: 1,
          published: 1,
          draft: 1,
        },
      },
      {
        $sort: { total: -1 },
      },
    ]);

    res.json({
      examsPerType,
      total: examsPerType.reduce((sum, item) => sum + item.total, 0),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// **MONTHLY STUDENT GROWTH** - Get student registrations grouped by month
router.get("/stats/students/monthly", requireAdminOrTutor, async (req, res) => {
  try {
    const { year } = req.query;
    const matchStage = { role: "student" };

    // Filter by year if provided
    if (year) {
      const yearNum = parseInt(year);
      matchStage.createdAt = {
        $gte: new Date(yearNum, 0, 1),
        $lt: new Date(yearNum + 1, 0, 1),
      };
    }

    const monthlyStudentGrowth = await UserModel.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
          },
          blocked: {
            $sum: { $cond: [{ $eq: ["$status", "blocked"] }, 1, 0] },
          },
        },
      },
      {
        $sort: { "_id.year": -1, "_id.month": -1 },
      },
      {
        $project: {
          _id: 0,
          year: "$_id.year",
          month: "$_id.month",
          monthName: {
            $arrayElemAt: [
              [
                "",
                "January",
                "February",
                "March",
                "April",
                "May",
                "June",
                "July",
                "August",
                "September",
                "October",
                "November",
                "December",
              ],
              "$_id.month",
            ],
          },
          count: 1,
          active: 1,
          blocked: 1,
        },
      },
    ]);

    res.json({
      monthlyStudentGrowth,
      total: monthlyStudentGrowth.reduce((sum, item) => sum + item.count, 0),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
