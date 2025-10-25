const Router = require("express").Router;
const Exam = require("../models/exam.model");
const Section = require("../models/section.model");
const Part = require("../models/part.model");
const QuestionGroup = require("../models/group.model");
const mongoose = require("mongoose");
const auth = require("../middlewares/auth.middleware");

const router = Router();

// Open endpoints (no auth): published and non-deleted exams
router.get("/open", async (req, res) => {
  try {
    const { type, page = 1, limit = 20 } = req.query;
    const query = { status: "published", deletedAt: null };
    if (type) query.type = { $regex: String(type), $options: "i" };

    const skip = (Number(page) - 1) * Number(limit);
    const [exams, total] = await Promise.all([
      Exam.find(query)
        .select(
          "title type duration totalQuestions featureImage status sections createdAt"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Exam.countDocuments(query),
    ]);

    // Load section details for each exam
    const items = await Promise.all(
      exams.map(async (exam) => {
        const examObj = exam.toObject();

        // Load section documents for this exam
        const sections = await Section.find({
          _id: { $in: exam.sections },
        }).select("sectionType title duration totalQuestions");

        return {
          ...examObj,
          sections,
        };
      })
    );

    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/open/:examId", async (req, res) => {
  try {
    const { examId } = req.params;
    const exam = await Exam.findOne({
      _id: examId,
      status: "published",
      deletedAt: null,
    }).select(
      "title type duration totalQuestions featureImage status sections"
    );
    if (!exam) return res.status(404).json({ error: "Exam not found" });

    // Load only section documents (no parts/groups)
    const sections = await Section.find({ _id: { $in: exam.sections } }).select(
      "sectionType title duration totalQuestions"
    );

    return res.json({
      _id: exam._id,
      title: exam.title,
      type: exam.type,
      duration: exam.duration,
      totalQuestions: exam.totalQuestions,
      featureImage: exam.featureImage,
      sections,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid Exam ID" });
    }
    res.status(500).json({ error: error.message });
  }
});

// Public: get a specific section of a published exam (basic fields only)
router.get("/open/:examId/sections/:sectionId", async (req, res) => {
  try {
    const { examId, sectionId } = req.params;
    const exam = await Exam.findOne({
      _id: examId,
      status: "published",
      deletedAt: null,
    }).select("sections");
    if (!exam) return res.status(404).json({ error: "Exam not found" });

    const isMember = (exam.sections || []).some(
      (s) => String(s._id || s) === String(sectionId)
    );
    if (!isMember)
      return res.status(404).json({ error: "Section not part of this exam" });

    const section = await Section.findById(sectionId).select(
      "sectionType title duration totalQuestions instructions"
    );
    if (!section) return res.status(404).json({ error: "Section not found" });

    return res.json(section);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid ID" });
    }
    return res.status(500).json({ error: error.message });
  }
});

// Protect all exam routes with JWT auth
router.use(auth);

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

// **CREATE** a new Exam (supports creating new Sections/Parts/Groups)
router.post(
  "/",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { title, type, duration, totalQuestions, featureImage, sections } =
        req.body;

      if (!title || !type) {
        return res
          .status(400)
          .json({ error: "Title and type are required fields." });
      }

      // Duplicate guard: same title+type not allowed
      const existing = await Exam.findOne({ title, type });
      if (existing) {
        return res
          .status(409)
          .json({ error: "Exam with same title and type already exists" });
      }

      // Build sections: accept IDs or objects; nested parts/groups can also be IDs or objects
      let sectionIds = [];
      if (Array.isArray(sections) && sections.length > 0) {
        for (const sectionItem of sections) {
          // If section is existing by id or has _id, just reference it
          if (
            typeof sectionItem === "string" ||
            (sectionItem && typeof sectionItem._id === "string")
          ) {
            sectionIds.push(
              typeof sectionItem === "string" ? sectionItem : sectionItem._id
            );
            continue;
          }

          const sectionPayload = sectionItem || {};

          // Build parts for this section
          let partIds = [];
          if (
            Array.isArray(sectionPayload.parts) &&
            sectionPayload.parts.length > 0
          ) {
            for (const partItem of sectionPayload.parts) {
              if (
                typeof partItem === "string" ||
                (partItem && typeof partItem._id === "string")
              ) {
                partIds.push(
                  typeof partItem === "string" ? partItem : partItem._id
                );
                continue;
              }

              const partPayload = partItem || {};
              // Build question groups for this part
              let groupIds = [];
              if (
                Array.isArray(partPayload.questionGroups) &&
                partPayload.questionGroups.length > 0
              ) {
                for (const gItem of partPayload.questionGroups) {
                  if (
                    typeof gItem === "string" ||
                    (gItem && typeof gItem._id === "string")
                  ) {
                    groupIds.push(
                      typeof gItem === "string" ? gItem : gItem._id
                    );
                  } else {
                    const g = gItem || {};
                    const createdGroup = await QuestionGroup.create({
                      groupNumber: g.groupNumber,
                      groupName: g.groupName,
                      questionType: g.questionType,
                      directionText: g.directionText,
                      answerList: g.answerList,
                      questionBox: g.questionBox,
                      passageText: g.passageText,
                      imageUrl: g.imageUrl,
                      audioUrl: g.audioUrl,
                      textItems: g.textItems,
                      image: g.image,
                      questions: g.questions,
                    });
                    groupIds.push(createdGroup._id);
                  }
                }
              }

              const createdPart = await Part.create({
                type: partPayload.type,
                directionText: partPayload.directionText,
                audioUrl: partPayload.audioUrl,
                context: partPayload.context,
                questionGroups: groupIds,
              });
              partIds.push(createdPart._id);
            }
          }

          const createdSection = await Section.create({
            examType: sectionPayload.examType,
            sectionType: sectionPayload.sectionType,
            title: sectionPayload.title,
            duration: sectionPayload.duration,
            totalQuestions: sectionPayload.totalQuestions,
            instructions: sectionPayload.instructions,
            parts: partIds,
          });
          sectionIds.push(createdSection._id);
        }
      }

      const examId = new mongoose.Types.ObjectId().toString();
      // Support both status and boolean published in payload
      let status = req.body.status;
      if (typeof req.body.published === "boolean") {
        status = req.body.published ? "published" : "draft";
      }
      if (status !== "published") status = "draft";

      const savedExam = await Exam.create({
        _id: examId,
        title,
        type,
        duration,
        totalQuestions,
        featureImage,
        status,
        sections: sectionIds,
      });

      return res.status(201).json(savedExam);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
);
// **READ** all Exams (list view)
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      q,
      type,
      status,
      includeDeleted = false,
    } = req.query;
    const query = { deletedAt: null }; // Exclude soft-deleted by default
    if (includeDeleted === "true" && req.user?.role !== "student") {
      delete query.deletedAt; // Show all including deleted for non-students
    }
    if (q) query.title = { $regex: String(q), $options: "i" };
    if (type) query.type = { $regex: String(type), $options: "i" };
    // Students only see published by default
    if (req.user?.role === "student") {
      query.status = "published";
    } else if (status) {
      query.status = status;
    }
    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Exam.find(query)
        .select(
          "title type duration totalQuestions featureImage status deletedAt"
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Exam.countDocuments(query),
    ]);
    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// **READ** a single Exam with full details (nested structure)
router.get("/:examId", async (req, res) => {
  try {
    const { examId } = req.params;

    // 1. Find the Exam document (exclude soft-deleted)
    const exam = await Exam.findOne({ _id: examId, deletedAt: null });
    if (!exam) {
      return res.status(404).json({ error: "Exam not found" });
    }

    // 2. Find all Sections for the exam
    const sections = await Section.find({ _id: { $in: exam.sections } });

    // 3. Find all Parts for the sections
    const allPartIds = sections.flatMap((section) =>
      section.parts.map((part) => part._id)
    );

    const parts = await Part.find({ _id: { $in: allPartIds } });

    // 4. Find all QuestionGroups for the parts
    const groupIds = parts.flatMap((part) =>
      part.questionGroups.map((group) => group._id)
    );
    const groups = await QuestionGroup.find({ _id: { $in: groupIds } });

    // 5. Assemble the complete exam structure
    const examStructure = exam.toObject();
    const userRole = req.user?.role;
    const isAdminOrTeacher = ["admin", "teacher", "moderator"].includes(
      userRole
    );

    examStructure.sections = sections.map((section) => {
      const sectionObj = section.toObject();
      sectionObj.parts = parts
        .filter((part) =>
          section.parts.some((partId) => partId.equals(part._id))
        )
        .map((part) => {
          const partObj = part.toObject();
          // Correctly filter groups based on the IDs in the part's questionGroups array
          partObj.questionGroups = groups
            .filter((group) =>
              part.questionGroups.some((groupId) => groupId.equals(group._id))
            )
            .map((group) => {
              const groupObj = group.toObject();

              // Hide correct answers for students
              if (!isAdminOrTeacher) {
                groupObj.questions = (groupObj.questions || []).map(
                  (question) => {
                    const {
                      correctAnswer,
                      explanation,
                      ...questionWithoutAnswers
                    } = question;
                    return questionWithoutAnswers;
                  }
                );
              }

              return groupObj;
            });
          return partObj;
        });
      return sectionObj;
    });

    res.json(examStructure);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid Exam ID" });
    }
    res.status(500).json({ error: error.message });
  }
});

// Authenticated: list sections for an exam (basic metadata)
router.get("/:examId/sections", async (req, res) => {
  try {
    const { examId } = req.params;
    const exam = await Exam.findOne({ _id: examId, deletedAt: null }).select(
      "status sections"
    );
    if (!exam) return res.status(404).json({ error: "Exam not found" });

    // Students may only view published exams
    if (req.user?.role === "student" && exam.status !== "published") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const sections = await Section.find({ _id: { $in: exam.sections } }).select(
      "sectionType title duration totalQuestions"
    );
    return res.json({ items: sections });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid Exam ID" });
    }
    return res.status(500).json({ error: error.message });
  }
});

// Authenticated: get a specific section of an exam; validates membership
router.get("/:examId/sections/:sectionId", async (req, res) => {
  try {
    const { examId, sectionId } = req.params;
    const exam = await Exam.findOne({ _id: examId, deletedAt: null }).select(
      "status sections"
    );
    if (!exam) return res.status(404).json({ error: "Exam not found" });

    const isMember = (exam.sections || []).some(
      (s) => String(s._id || s) === String(sectionId)
    );
    if (!isMember)
      return res.status(404).json({ error: "Section not part of this exam" });

    // Role policy: students can only access sections of published exams
    const role = req.user?.role;
    const isStaff = ["admin", "teacher", "moderator"].includes(role);
    if (role === "student" && exam.status !== "published") {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Load section, parts, groups
    const section = await Section.findById(sectionId);
    if (!section) return res.status(404).json({ error: "Section not found" });

    const partIds = (section.parts || []).map((p) => p._id || p);
    const parts = await Part.find({ _id: { $in: partIds } });
    const groupIds = parts.flatMap((p) =>
      (p.questionGroups || []).map((g) => g._id || g)
    );
    const groups = await QuestionGroup.find({ _id: { $in: groupIds } });

    // Assemble nested structure
    const partsById = new Map(parts.map((p) => [String(p._id), p]));
    const groupsById = new Map(groups.map((g) => [String(g._id), g]));

    const sectionObj = section.toObject();
    sectionObj.parts = (section.parts || [])
      .map((pid) => {
        const part = partsById.get(String(pid._id || pid));
        if (!part) return null;
        const partObj = part.toObject();
        partObj.questionGroups = (part.questionGroups || [])
          .map((gid) => {
            const group = groupsById.get(String(gid._id || gid));
            if (!group) return null;
            const groupObj = group.toObject();
            // In this endpoint, staff can see answers; students will also see unless you prefer otherwise.
            // We keep answers for staff only by stripping for non-staff.
            if (!isStaff) {
              groupObj.questions = (groupObj.questions || []).map((q) => {
                const { correctAnswer, explanation, ...rest } = q;
                return rest;
              });
            }
            return groupObj;
          })
          .filter(Boolean);
        return partObj;
      })
      .filter(Boolean);

    return res.json(sectionObj);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid ID" });
    }
    return res.status(500).json({ error: error.message });
  }
});

// Authenticated: student-safe endpoint that always hides correct answers and explanations
router.get("/:examId/sections/:sectionId/student", async (req, res) => {
  try {
    const { examId, sectionId } = req.params;
    const exam = await Exam.findOne({ _id: examId, deletedAt: null }).select(
      "status sections"
    );
    if (!exam) return res.status(404).json({ error: "Exam not found" });

    // Student-safe: must be published
    if (exam.status !== "published") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const isMember = (exam.sections || []).some(
      (s) => String(s._id || s) === String(sectionId)
    );
    if (!isMember)
      return res.status(404).json({ error: "Section not part of this exam" });

    const section = await Section.findById(sectionId);
    if (!section) return res.status(404).json({ error: "Section not found" });

    const partIds = (section.parts || []).map((p) => p._id || p);
    const parts = await Part.find({ _id: { $in: partIds } });
    const groupIds = parts.flatMap((p) =>
      (p.questionGroups || []).map((g) => g._id || g)
    );
    const groups = await QuestionGroup.find({ _id: { $in: groupIds } });

    const partsById = new Map(parts.map((p) => [String(p._id), p]));
    const groupsById = new Map(groups.map((g) => [String(g._id), g]));

    const sectionObj = section.toObject();
    sectionObj.parts = (section.parts || [])
      .map((pid) => {
        const part = partsById.get(String(pid._id || pid));
        if (!part) return null;
        const partObj = part.toObject();
        partObj.questionGroups = (part.questionGroups || [])
          .map((gid) => {
            const group = groupsById.get(String(gid._id || gid));
            if (!group) return null;
            const groupObj = group.toObject();
            // Always hide answers here
            groupObj.questions = (groupObj.questions || []).map((q) => {
              const { correctAnswer, explanation, ...rest } = q;
              return rest;
            });
            return groupObj;
          })
          .filter(Boolean);
        return partObj;
      })
      .filter(Boolean);

    return res.json(sectionObj);
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid ID" });
    }
    return res.status(500).json({ error: error.message });
  }
});

// **UPDATE** an Exam
router.put(
  "/:examId",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { examId } = req.params;
      const updatedExam = await Exam.findByIdAndUpdate(examId, req.body, {
        new: true, // Return the updated document
        runValidators: true, // Run schema validators
      });

      if (!updatedExam) {
        return res.status(404).json({ error: "Exam not found" });
      }

      res.json(updatedExam);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// **SOFT DELETE** an Exam
router.delete(
  "/:examId",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { examId } = req.params;

      const exam = await Exam.findOne({ _id: examId, deletedAt: null });
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }

      // Soft delete: set deletedAt timestamp
      exam.deletedAt = new Date();
      await exam.save();

      res.status(200).json({
        message: "Exam soft deleted successfully.",
        deletedAt: exam.deletedAt,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// **RESTORE** a soft-deleted Exam
router.post(
  "/:examId/restore",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { examId } = req.params;

      const exam = await Exam.findOne({
        _id: examId,
        deletedAt: { $ne: null },
      });
      if (!exam) {
        return res.status(404).json({ error: "Soft-deleted exam not found" });
      }

      exam.deletedAt = null;
      await exam.save();

      res.status(200).json({
        message: "Exam restored successfully.",
        exam: { _id: exam._id, title: exam.title, status: exam.status },
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// **HARD DELETE** an Exam (permanent removal)
router.delete("/:examId/hard", requireRole("admin"), async (req, res) => {
  try {
    const { examId } = req.params;

    // 1. Find the exam to get its sections
    const examToDelete = await Exam.findById(examId);
    if (!examToDelete) {
      return res.status(404).json({ error: "Exam not found" });
    }

    // 2. Check if sections are used in other exams
    const sections = await Section.find({
      _id: { $in: examToDelete.sections },
    });
    const sectionIds = sections.map((s) => s._id);

    // Check if any sections are referenced by other exams
    const otherExamsUsingSections = await Exam.find({
      _id: { $ne: examId },
      sections: { $in: sectionIds },
    }).select("_id title");

    if (otherExamsUsingSections.length > 0) {
      return res.status(409).json({
        error: "Cannot delete exam: sections are being used by other exams",
        conflictingExams: otherExamsUsingSections.map((exam) => ({
          _id: exam._id,
          title: exam.title,
        })),
        conflictingSections: sectionIds,
      });
    }

    // 3. Check if parts are used in other sections
    const parts = await Part.find({ sectionId: { $in: sectionIds } });
    const partIds = parts.map((p) => p._id);

    const otherSectionsUsingParts = await Section.find({
      _id: { $nin: sectionIds },
      parts: { $in: partIds },
    }).select("_id sectionType title");

    if (otherSectionsUsingParts.length > 0) {
      return res.status(409).json({
        error: "Cannot delete exam: parts are being used by other sections",
        conflictingSections: otherSectionsUsingParts.map((section) => ({
          _id: section._id,
          sectionType: section.sectionType,
          title: section.title,
        })),
        conflictingParts: partIds,
      });
    }

    // 4. Check if question groups are used in other parts
    const otherPartsUsingGroups = await Part.find({
      _id: { $nin: partIds },
      questionGroups: { $in: parts.flatMap((p) => p.questionGroups) },
    }).select("_id type");

    if (otherPartsUsingGroups.length > 0) {
      return res.status(409).json({
        error:
          "Cannot delete exam: question groups are being used by other parts",
        conflictingParts: otherPartsUsingGroups.map((part) => ({
          _id: part._id,
          type: part.type,
        })),
      });
    }

    // 5. Safe to delete - remove in correct order to avoid orphaned documents
    await QuestionGroup.deleteMany({ partId: { $in: partIds } });
    await Part.deleteMany({ sectionId: { $in: sectionIds } });
    await Section.deleteMany({ _id: { $in: sectionIds } });

    // 6. Delete the exam itself
    await Exam.findByIdAndDelete(examId);

    res.status(200).json({
      message: "Exam and all associated data permanently deleted.",
      deletedExam: {
        _id: examToDelete._id,
        title: examToDelete.title,
        type: examToDelete.type,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sections management on an exam (Option B parity for sections)
router.post(
  "/:examId/sections",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { examId } = req.params;
      const { sections } = req.body;
      if (!Array.isArray(sections) || sections.length === 0)
        return res.status(400).json({ error: "sections array is required" });
      const exam = await Exam.findById(examId);
      if (!exam) return res.status(404).json({ error: "Exam not found" });

      const newIds = [];
      for (const item of sections) {
        if (
          typeof item === "string" ||
          (item && typeof item._id === "string")
        ) {
          newIds.push(typeof item === "string" ? item : item._id);
        } else {
          const payload = item || {};
          // Build parts if provided
          let partIds = [];
          if (Array.isArray(payload.parts)) {
            for (const p of payload.parts) {
              if (typeof p === "string" || (p && typeof p._id === "string")) {
                partIds.push(typeof p === "string" ? p : p._id);
              } else {
                const createdPart = await Part.create(p || {});
                partIds.push(createdPart._id);
              }
            }
          }
          const createdSection = await Section.create({
            examType: payload.examType,
            sectionType: payload.sectionType,
            title: payload.title,
            duration: payload.duration,
            totalQuestions: payload.totalQuestions,
            instructions: payload.instructions,
            parts: partIds,
          });
          newIds.push(createdSection._id);
        }
      }

      const existingIds = exam.sections.map((s) => String(s._id || s));
      for (const id of newIds) {
        if (!existingIds.includes(String(id))) exam.sections.push(id);
      }
      await exam.save();
      res.json(exam);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// Answer key with policy: teachers/moderators/admin unrestricted; students only if they have a graded attempt for this exam
router.get("/:examId/answer-key", async (req, res) => {
  try {
    const { examId } = req.params;
    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ error: "Exam not found" });

    // Policy check
    const role = req.user?.role;
    if (!role) return res.status(401).json({ error: "Unauthorized" });
    if (role === "student") {
      const Attempt = require("../models/attempt.model");
      const graded = await Attempt.findOne({
        userId: req.user.id,
        examId,
        status: "graded",
      });
      if (!graded) return res.status(403).json({ error: "Forbidden" });
    }

    // Build key
    const sections = await Section.find({ _id: { $in: exam.sections } });
    const parts = await Part.find({
      _id: { $in: sections.flatMap((s) => s.parts) },
    });
    const groups = await QuestionGroup.find({
      _id: { $in: parts.flatMap((p) => p.questionGroups) },
    });
    const partsById = new Map(parts.map((p) => [String(p._id), p]));
    const groupsById = new Map(groups.map((g) => [String(g._id), g]));

    const key = sections.map((section) => {
      const s = {
        _id: section._id,
        title: section.title,
        sectionType: section.sectionType,
      };
      s.parts = (section.parts || [])
        .map((pid) => {
          const p = partsById.get(String(pid._id || pid));
          if (!p) return null;
          const po = { _id: p._id, type: p.type };
          po.questionGroups = (p.questionGroups || [])
            .map((gid) => {
              const g = groupsById.get(String(gid._id || gid));
              if (!g) return null;
              return {
                _id: g._id,
                questionType: g.questionType,
                questions: (g.questions || []).map((q) => ({
                  _id: q._id,
                  questionType: q.questionType,
                  correctAnswer: q.correctAnswer,
                  weight: q.weight,
                  explanation: q.explanation,
                })),
              };
            })
            .filter(Boolean);
          return po;
        })
        .filter(Boolean);
      return s;
    });

    res.json({
      exam: { _id: exam._id, title: exam.title, type: exam.type },
      key,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put(
  "/:examId/sections",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { examId } = req.params;
      const { sections } = req.body;
      if (!Array.isArray(sections))
        return res.status(400).json({ error: "sections array is required" });
      const exam = await Exam.findById(examId);
      if (!exam) return res.status(404).json({ error: "Exam not found" });

      const builtIds = [];
      for (const item of sections) {
        if (
          typeof item === "string" ||
          (item && typeof item._id === "string")
        ) {
          builtIds.push(typeof item === "string" ? item : item._id);
        } else {
          const payload = item || {};
          let partIds = [];
          if (Array.isArray(payload.parts)) {
            for (const p of payload.parts) {
              if (typeof p === "string" || (p && typeof p._id === "string")) {
                partIds.push(typeof p === "string" ? p : p._id);
              } else {
                const createdPart = await Part.create(p || {});
                partIds.push(createdPart._id);
              }
            }
          }
          const createdSection = await Section.create({
            examType: payload.examType,
            sectionType: payload.sectionType,
            title: payload.title,
            duration: payload.duration,
            totalQuestions: payload.totalQuestions,
            instructions: payload.instructions,
            parts: partIds,
          });
          builtIds.push(createdSection._id);
        }
      }
      exam.sections = builtIds;
      await exam.save();
      res.json(exam);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

router.delete(
  "/:examId/sections/:sectionId",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { examId, sectionId } = req.params;
      const exam = await Exam.findById(examId);
      if (!exam) return res.status(404).json({ error: "Exam not found" });
      exam.sections = exam.sections.filter(
        (s) => String(s._id || s) !== String(sectionId)
      );
      await exam.save();
      res.json({ message: "Unlinked" });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }
);

// **UPDATE EXAM STATUS** - Dedicated endpoint for status updates
router.patch(
  "/:examId/status",
  requireRole("teacher", "moderator", "admin"),
  async (req, res) => {
    try {
      const { examId } = req.params;
      const { status } = req.body;

      // Validate status value
      if (!status || !["draft", "published"].includes(status)) {
        return res.status(400).json({
          error: "Status is required and must be either 'draft' or 'published'",
        });
      }

      // Find the exam (exclude soft-deleted)
      const exam = await Exam.findOne({ _id: examId, deletedAt: null });
      if (!exam) {
        return res.status(404).json({ error: "Exam not found" });
      }

      // Update only the status field
      exam.status = status;
      await exam.save();

      res.json({
        message: "Exam status updated successfully",
        exam: {
          _id: exam._id,
          title: exam.title,
          status: exam.status,
          updatedAt: exam.updatedAt,
        },
      });
    } catch (error) {
      if (error.name === "CastError") {
        return res.status(400).json({ error: "Invalid Exam ID" });
      }
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;
