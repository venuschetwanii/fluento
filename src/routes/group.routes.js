const Router = require("express").Router;
const auth = require("../middlewares/auth.middleware");
const QuestionGroup = require("../models/group.model");

const router = Router();

// Protect endpoints
router.use(auth);

// Role guard
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

// Append questions to a group
router.post(
  "/:groupId/questions",
  requireRole("tutor", "admin"),
  async (req, res) => {
    try {
      const { groupId } = req.params;
      const { questions } = req.body;
      if (!Array.isArray(questions) || questions.length === 0)
        return res.status(400).json({ error: "questions array is required" });

      const group = await QuestionGroup.findById(groupId);
      if (!group) return res.status(404).json({ error: "Group not found" });

      // Push provided questions; _id will be generated for each
      for (const q of questions) {
        if (q) group.questions.push(q);
      }
      await group.save();
      res.json(group);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

// Replace all questions in a group
router.put(
  "/:groupId/questions",
  requireRole("tutor", "admin"),
  async (req, res) => {
    try {
      const { groupId } = req.params;
      const { questions } = req.body;
      if (!Array.isArray(questions))
        return res.status(400).json({ error: "questions array is required" });
      const group = await QuestionGroup.findById(groupId);
      if (!group) return res.status(404).json({ error: "Group not found" });
      group.questions = questions;
      await group.save();
      res.json(group);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

// Update a single question by question _id (partial update)
router.patch(
  "/:groupId/questions/:questionId",
  requireRole("tutor", "admin"),
  async (req, res) => {
    try {
      const { groupId, questionId } = req.params;
      const updates = req.body || {};
      const group = await QuestionGroup.findById(groupId);
      if (!group) return res.status(404).json({ error: "Group not found" });
      const idx = (group.questions || []).findIndex(
        (q) => String(q._id) === String(questionId)
      );
      if (idx === -1)
        return res.status(404).json({ error: "Question not found" });
      const current = group.questions[idx].toObject
        ? group.questions[idx].toObject()
        : group.questions[idx];
      group.questions[idx] = { ...current, ...updates };
      await group.save();
      res.json(group.questions[idx]);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

// Delete a question from a group by question _id
router.delete(
  "/:groupId/questions/:questionId",
  requireRole("tutor", "admin"),
  async (req, res) => {
    try {
      const { groupId, questionId } = req.params;
      const group = await QuestionGroup.findById(groupId);
      if (!group) return res.status(404).json({ error: "Group not found" });
      const before = group.questions.length;
      group.questions = (group.questions || []).filter(
        (q) => String(q._id) !== String(questionId)
      );
      if (group.questions.length === before)
        return res.status(404).json({ error: "Question not found" });
      await group.save();
      res.json({ message: "Deleted" });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

// Bulk import questions (expects array)
router.post(
  "/:groupId/questions:bulk-import",
  requireRole("tutor", "admin"),
  async (req, res) => {
    try {
      const { groupId } = req.params;
      const { questions } = req.body;
      if (!Array.isArray(questions) || questions.length === 0)
        return res.status(400).json({ error: "questions array is required" });
      const group = await QuestionGroup.findById(groupId);
      if (!group) return res.status(404).json({ error: "Group not found" });
      group.questions = [...(group.questions || []), ...questions];
      await group.save();
      res.json({ count: questions.length });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

module.exports = router;
