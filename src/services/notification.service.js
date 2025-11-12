const NotificationModel = require("../models/notification.model");

/**
 * Create a notification for CRUD operations
 * @param {Object} options - Notification options
 * @param {string} options.type - Type: 'exam', 'course', 'admin', 'user'
 * @param {string} options.action - Action: 'create', 'update', 'delete', 'restore'
 * @param {string} options.entityId - ID of the entity (exam, course, user)
 * @param {string} options.entityName - Name/title of the entity
 * @param {string} options.performedBy - User ID who performed the action
 * @param {string} options.performedByName - Name of the user who performed the action
 * @param {string} options.message - Human-readable notification message
 * @param {Object} options.metadata - Additional metadata (optional)
 * @returns {Promise<Object>} Created notification
 */
async function createNotification({
  type,
  action,
  entityId,
  entityName,
  performedBy,
  performedByName,
  message,
  metadata = {},
}) {
  try {
    console.log("Creating notification:", {
      type,
      action,
      entityId: String(entityId),
      entityName,
      performedBy: String(performedBy),
      performedByName,
    });

    const notification = await NotificationModel.create({
      type,
      action,
      entityId: String(entityId),
      entityName,
      performedBy,
      performedByName,
      message,
      metadata,
    });

    console.log("Notification created successfully:", notification._id);
    return notification;
  } catch (error) {
    console.error("Error creating notification:", error);
    console.error("Notification creation error details:", {
      message: error.message,
      stack: error.stack,
      type,
      action,
      entityId: String(entityId),
      entityName,
      performedBy: String(performedBy),
    });
    // Don't throw error - notifications shouldn't break the main flow
    return null;
  }
}

/**
 * Create notification for Exam operations
 */
async function notifyExamChange(
  action,
  exam,
  performedBy,
  performedByName,
  metadata = {}
) {
  return createNotification({
    type: "exam",
    action,
    entityId: exam._id || exam,
    entityName: exam.title || "Unknown Exam",
    performedBy,
    performedByName,
    message: getExamMessage(
      action,
      exam.title || "Unknown Exam",
      performedByName
    ),
    metadata: {
      examType: exam.type,
      examId: exam._id || exam,
      ...metadata,
    },
  });
}

/**
 * Create notification for Course operations
 */
async function notifyCourseChange(
  action,
  course,
  performedBy,
  performedByName,
  metadata = {}
) {
  return createNotification({
    type: "course",
    action,
    entityId: course._id || course,
    entityName: course.title || "Unknown Course",
    performedBy,
    performedByName,
    message: getCourseMessage(
      action,
      course.title || "Unknown Course",
      performedByName
    ),
    metadata: {
      examType: course.examType,
      courseId: course._id || course,
      ...metadata,
    },
  });
}

/**
 * Create notification for Admin/User operations
 * Note: This is used for both admin and tutor creation/updates
 */
async function notifyAdminChange(
  action,
  user,
  performedBy,
  performedByName,
  metadata = {}
) {
  // Determine notification type based on user role
  const notificationType = user.role === "admin" ? "admin" : "user";

  return createNotification({
    type: notificationType,
    action,
    entityId: user._id || user,
    entityName: user.name || user.email || "Unknown User",
    performedBy,
    performedByName,
    message: getAdminMessage(
      action,
      user.name || user.email || "Unknown User",
      performedByName
    ),
    metadata: {
      userRole: user.role,
      userEmail: user.email,
      userId: user._id || user,
      ...metadata,
    },
  });
}

/**
 * Generate human-readable messages for Exam operations
 */
function getExamMessage(action, examTitle, performedByName) {
  const messages = {
    create: `${performedByName} created a new exam: "${examTitle}"`,
    update: `${performedByName} updated the exam: "${examTitle}"`,
    delete: `${performedByName} deleted the exam: "${examTitle}"`,
    restore: `${performedByName} restored the exam: "${examTitle}"`,
  };
  return (
    messages[action] ||
    `${performedByName} performed ${action} on exam: "${examTitle}"`
  );
}

/**
 * Generate human-readable messages for Course operations
 */
function getCourseMessage(action, courseTitle, performedByName) {
  const messages = {
    create: `${performedByName} created a new course: "${courseTitle}"`,
    update: `${performedByName} updated the course: "${courseTitle}"`,
    delete: `${performedByName} deleted the course: "${courseTitle}"`,
    restore: `${performedByName} restored the course: "${courseTitle}"`,
  };
  return (
    messages[action] ||
    `${performedByName} performed ${action} on course: "${courseTitle}"`
  );
}

/**
 * Generate human-readable messages for Admin/User operations
 */
function getAdminMessage(action, userName, performedByName) {
  const messages = {
    create: `${performedByName} created a new user: "${userName}"`,
    update: `${performedByName} updated user: "${userName}"`,
    delete: `${performedByName} deleted/blocked user: "${userName}"`,
    restore: `${performedByName} restored/unblocked user: "${userName}"`,
  };
  return (
    messages[action] ||
    `${performedByName} performed ${action} on user: "${userName}"`
  );
}

module.exports = {
  createNotification,
  notifyExamChange,
  notifyCourseChange,
  notifyAdminChange,
};
