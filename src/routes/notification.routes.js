const Router = require("express").Router;
const NotificationModel = require("../models/notification.model");
const auth = require("../middlewares/auth.middleware");

const router = Router();

// Protect all notification routes with JWT auth
router.use(auth);

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

// **LIST** all notifications (admin and tutor only)
router.get("/", requireAdminOrTutor, async (req, res) => {
  try {
    const {
      type,
      action,
      isRead,
      performedBy,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    // Filter by type (exam, course, admin, user)
    if (type && ["exam", "course", "admin", "user"].includes(type)) {
      query.type = type;
    }

    // Filter by action (create, update, delete, restore)
    if (action && ["create", "update", "delete", "restore"].includes(action)) {
      query.action = action;
    }

    // Filter by read status
    if (isRead !== undefined) {
      query.isRead = isRead === "true";
    }

    // Filter by performedBy
    if (performedBy) {
      query.performedBy = performedBy;
    }

    // Validate sortBy and sortOrder
    const validSortFields = [
      "createdAt",
      "updatedAt",
      "type",
      "action",
      "isRead",
    ];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const items = await NotificationModel.find(query)
      .populate("performedBy", "name email role")
      .populate("readBy", "name email")
      .sort({ [sortField]: sortDirection });

    res.json({
      items,
      total: items.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// **GET** unread notifications count
router.get("/unread/count", requireAdminOrTutor, async (req, res) => {
  try {
    const { type } = req.query;

    const query = { isRead: false };
    if (type && ["exam", "course", "admin", "user"].includes(type)) {
      query.type = type;
    }

    const count = await NotificationModel.countDocuments(query);

    res.json({
      unreadCount: count,
      type: type || "all",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// **GET** unread notifications
router.get("/unread", requireAdminOrTutor, async (req, res) => {
  try {
    const {
      type,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = { isRead: false };

    if (type && ["exam", "course", "admin", "user"].includes(type)) {
      query.type = type;
    }

    const validSortFields = ["createdAt", "updatedAt", "type", "action"];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const items = await NotificationModel.find(query)
      .populate("performedBy", "name email role")
      .sort({ [sortField]: sortDirection });

    res.json({
      items,
      total: items.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// **MARK AS READ** - Mark a single notification as read
router.patch("/:notificationId/read", requireAdminOrTutor, async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await NotificationModel.findById(notificationId);
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    if (notification.isRead) {
      return res.json({
        message: "Notification already marked as read",
        notification,
      });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    notification.readBy = req.user.id;
    await notification.save();

    res.json({
      message: "Notification marked as read",
      notification,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid Notification ID" });
    }
    res.status(500).json({ error: error.message });
  }
});

// **MARK ALL AS READ** - Mark all notifications as read
router.patch("/read-all", requireAdminOrTutor, async (req, res) => {
  try {
    const { type } = req.query;

    const query = { isRead: false };
    if (type && ["exam", "course", "admin", "user"].includes(type)) {
      query.type = type;
    }

    const result = await NotificationModel.updateMany(query, {
      $set: {
        isRead: true,
        readAt: new Date(),
        readBy: req.user.id,
      },
    });

    res.json({
      message: "All notifications marked as read",
      updatedCount: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// **GET** notification statistics/analytics
router.get("/analytics", requireAdminOrTutor, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchQuery = {};
    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) {
        matchQuery.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        matchQuery.createdAt.$lte = new Date(endDate);
      }
    }

    const stats = await NotificationModel.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            type: "$type",
            action: "$action",
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.type",
          actions: {
            $push: {
              action: "$_id.action",
              count: "$count",
            },
          },
          total: { $sum: "$count" },
        },
      },
    ]);

    // Get top performers (users who made most changes)
    const topPerformers = await NotificationModel.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$performedBy",
          count: { $sum: 1 },
          name: { $first: "$performedByName" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Get recent activity
    const recentActivity = await NotificationModel.find(matchQuery)
      .populate("performedBy", "name email role")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({
      statistics: stats,
      topPerformers,
      recentActivity,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

