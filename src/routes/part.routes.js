const Router = require("express").Router;
const auth = require("../middlewares/auth.middleware");
const Part = require("../models/part.model");
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

// Get part by DB _id
router.get("/:partId", async (req, res) => {
  const part = await Part.findById(req.params.partId);
  if (!part) return res.status(404).json({ error: "Not found" });
  res.json(part);
});

// Append groups to a part (IDs or objects)
router.post(
  "/:partId/groups",
  requireRole("tutor", "admin"),
  async (req, res) => {
    try {
      const { groups } = req.body;
      const part = await Part.findById(req.params.partId);
      if (!part) return res.status(404).json({ error: "Part not found" });
      if (!Array.isArray(groups) || groups.length === 0)
        return res.status(400).json({ error: "groups array is required" });

      const newIds = [];
      for (const item of groups) {
        if (
          typeof item === "string" ||
          (item && typeof item._id === "string")
        ) {
          newIds.push(typeof item === "string" ? item : item._id);
        } else {
          const created = await QuestionGroup.create(item || {});
          newIds.push(created._id);
        }
      }
      const existingIds = part.questionGroups.map((g) => String(g._id || g));
      for (const id of newIds) {
        if (!existingIds.includes(String(id))) part.questionGroups.push(id);
      }
      await part.save();
      res.json(part);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

// Replace groups for a part
router.put(
  "/:partId/groups",
  requireRole("tutor", "admin"),
  async (req, res) => {
    try {
      const { groups } = req.body;
      const part = await Part.findById(req.params.partId);
      if (!part) return res.status(404).json({ error: "Part not found" });
      if (!Array.isArray(groups))
        return res.status(400).json({ error: "groups array is required" });

      const builtIds = [];
      for (const item of groups) {
        if (
          typeof item === "string" ||
          (item && typeof item._id === "string")
        ) {
          builtIds.push(typeof item === "string" ? item : item._id);
        } else {
          const created = await QuestionGroup.create(item || {});
          builtIds.push(created._id);
        }
      }
      part.questionGroups = builtIds;
      await part.save();
      res.json(part);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

// Unlink a group from a part
router.delete(
  "/:partId/groups/:groupId",
  requireRole("tutor", "admin"),
  async (req, res) => {
    try {
      const { partId, groupId } = req.params;
      const part = await Part.findById(partId);
      if (!part) return res.status(404).json({ error: "Part not found" });
      part.questionGroups = part.questionGroups.filter(
        (g) => String(g._id || g) !== String(groupId)
      );
      await part.save();
      res.json({ message: "Unlinked" });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

module.exports = router;
