const Router = require("express").Router;
const auth = require("../middlewares/auth.middleware");
const Section = require("../models/section.model");
const Part = require("../models/part.model");
const QuestionGroup = require("../models/group.model");

const router = Router();

// Protect all endpoints
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

// Append parts to a section (IDs or objects)
router.post(
  "/:sectionId/parts",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { sectionId } = req.params;
      const { parts } = req.body;
      const section = await Section.findById(sectionId);
      if (!section) return res.status(404).json({ error: "Section not found" });
      if (!Array.isArray(parts) || parts.length === 0)
        return res.status(400).json({ error: "parts array is required" });

      const newIds = [];
      for (const item of parts) {
        if (
          typeof item === "string" ||
          (item && typeof item._id === "string")
        ) {
          newIds.push(typeof item === "string" ? item : item._id);
        } else {
          const payload = item || {};
          // Create groups first if provided
          let groupIds = [];
          if (Array.isArray(payload.questionGroups)) {
            for (const g of payload.questionGroups) {
              if (typeof g === "string" || (g && typeof g._id === "string")) {
                groupIds.push(typeof g === "string" ? g : g._id);
              } else {
                const created = await QuestionGroup.create(g || {});
                groupIds.push(created._id);
              }
            }
          }
          const createdPart = await Part.create({
            id: payload.id,
            type: payload.type,
            directionText: payload.directionText,
            audioUrl: payload.audioUrl,
            context: payload.context,
            questionGroups: groupIds,
          });
          newIds.push(createdPart._id);
        }
      }

      const existingIds = section.parts.map((p) => String(p._id || p));
      for (const id of newIds) {
        if (!existingIds.includes(String(id))) section.parts.push(id);
      }
      await section.save();
      res.json(section);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

// Replace parts list for a section (IDs or objects)
router.put(
  "/:sectionId/parts",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { sectionId } = req.params;
      const { parts } = req.body;
      const section = await Section.findById(sectionId);
      if (!section) return res.status(404).json({ error: "Section not found" });
      if (!Array.isArray(parts))
        return res.status(400).json({ error: "parts array is required" });

      const builtIds = [];
      for (const item of parts) {
        if (
          typeof item === "string" ||
          (item && typeof item._id === "string")
        ) {
          builtIds.push(typeof item === "string" ? item : item._id);
        } else {
          const payload = item || {};
          let groupIds = [];
          if (Array.isArray(payload.questionGroups)) {
            for (const g of payload.questionGroups) {
              if (typeof g === "string" || (g && typeof g._id === "string")) {
                groupIds.push(typeof g === "string" ? g : g._id);
              } else {
                const created = await QuestionGroup.create(g || {});
                groupIds.push(created._id);
              }
            }
          }
          const createdPart = await Part.create({
            id: payload.id,
            type: payload.type,
            directionText: payload.directionText,
            audioUrl: payload.audioUrl,
            context: payload.context,
            questionGroups: groupIds,
          });
          builtIds.push(createdPart._id);
        }
      }
      section.parts = builtIds;
      await section.save();
      res.json(section);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

// Unlink a part from a section (non-destructive)
router.delete(
  "/:sectionId/parts/:partId",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { sectionId, partId } = req.params;
      const section = await Section.findById(sectionId);
      if (!section) return res.status(404).json({ error: "Section not found" });
      section.parts = section.parts.filter(
        (p) => String(p._id || p) !== String(partId)
      );
      await section.save();
      res.json({ message: "Unlinked" });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
);

module.exports = router;
