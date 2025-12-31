const Router = require("express").Router;
const AttemptModel = require("../models/attempt.model");
const auth = require("../middlewares/auth.middleware");
const Exam = require("../models/exam.model");
const Section = require("../models/section.model");
const Part = require("../models/part.model");
const QuestionGroup = require("../models/group.model");
const OpenAI = require("openai");
const {
  gradeIELTSSection,
  gradeIELTSExam,
  calculateOverallBand,
} = require("../services/ielts-grading.service");

const router = Router();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Require authentication for all attempt endpoints
router.use(auth);

// Resume or create an in-progress attempt for an exam
router.post("/resume", async (req, res) => {
  try {
    const { examId, forceNew = false } = req.body;
    if (!examId) return res.status(400).json({ error: "examId is required" });

    // Validate exam exists
    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ error: "Exam not found" });

    // Check if exam is active/available
    if (exam.status && exam.status !== "active") {
      return res.status(400).json({
        error: "Exam is not available",
        examStatus: exam.status,
      });
    }

    // Check for existing attempts
    const existingAttempts = await AttemptModel.find({
      userId: req.user.id,
      examId,
    }).sort({ createdAt: -1 });

    // Check for expired attempts
    const expiredAttempts = existingAttempts.filter(
      (a) =>
        a.status === "expired" ||
        (a.expiresAt && new Date(a.expiresAt) < new Date())
    );

    // Check for in-progress attempts
    let inProgressAttempt = existingAttempts.find(
      (a) =>
        a.status === "in_progress" &&
        (!a.expiresAt || new Date(a.expiresAt) > new Date())
    );

    // Auto-expire overdue in-progress attempts
    if (
      inProgressAttempt &&
      inProgressAttempt.expiresAt &&
      new Date(inProgressAttempt.expiresAt) < new Date()
    ) {
      inProgressAttempt.status = "expired";
      await inProgressAttempt.save();
      inProgressAttempt = null;
    }

    let attempt;

    if (forceNew || !inProgressAttempt) {
      // Create new attempt
      attempt = new AttemptModel({
        userId: req.user.id,
        examId,
        attemptType: "full_exam",
        status: "in_progress",
        startedAt: new Date(),
      });

      // Initialize per-section status
      if (exam && Array.isArray(exam.sections)) {
        attempt.sectionsStatus = (exam.sections || []).map((sid) => ({
          sectionId: sid._id || sid,
          status: "in_progress",
        }));
      }

      // Set expiresAt based on exam duration (assumed minutes)
      if (typeof exam.duration === "number" && exam.duration > 0) {
        const ms = exam.duration * 60 * 1000;
        attempt.expiresAt = new Date(attempt.startedAt.getTime() + ms);
      }

      await attempt.save();
    } else {
      // Resume existing attempt
      attempt = inProgressAttempt;
    }

    // Calculate remaining time
    let remainingMs = null;
    let isExpired = false;
    if (attempt.expiresAt) {
      remainingMs = Math.max(0, new Date(attempt.expiresAt) - new Date());
      isExpired = remainingMs === 0;
    }

    // Return comprehensive attempt data
    const response = {
      attempt: {
        _id: attempt._id,
        userId: attempt.userId,
        examId: attempt.examId,
        attemptType: attempt.attemptType,
        status: attempt.status,
        startedAt: attempt.startedAt,
        expiresAt: attempt.expiresAt,
        submittedAt: attempt.submittedAt,
        sectionsStatus: attempt.sectionsStatus,
        responses: attempt.responses?.length || 0,
        scoring: attempt.scoring,
      },
      exam: {
        _id: exam._id,
        title: exam.title,
        type: exam.type,
        duration: exam.duration,
        sections: exam.sections?.length || 0,
      },
      timeInfo: {
        remainingMs,
        isExpired,
        totalDuration: exam.duration ? exam.duration * 60 * 1000 : null,
      },
      previousAttempts: {
        total: existingAttempts.length,
        expired: expiredAttempts.length,
        submitted: existingAttempts.filter((a) => a.status === "submitted")
          .length,
        graded: existingAttempts.filter((a) => a.status === "graded").length,
      },
    };

    return res.json(response);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// Start exam for a specific section only
router.post("/sections/start", async (req, res) => {
  try {
    const { examId, sectionId } = req.body;
    if (!examId) return res.status(400).json({ error: "examId is required" });
    if (!sectionId)
      return res.status(400).json({ error: "sectionId is required" });

    // Validate exam exists
    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ error: "Exam not found" });

    // Validate section exists and belongs to exam
    if (
      !exam.sections ||
      !exam.sections.some((s) => String(s._id || s) === String(sectionId))
    ) {
      return res.status(404).json({ error: "Section not found in this exam" });
    }

    // Check for existing section-only attempt for this section
    let attempt = await AttemptModel.findOne({
      userId: req.user.id,
      examId,
      attemptType: "section_only",
      activeSectionId: sectionId,
      status: "in_progress",
    });

    if (!attempt) {
      // Get section details for duration calculation
      const Section = require("../models/section.model");
      const section = await Section.findById(sectionId);

      // Create new section-only attempt
      attempt = new AttemptModel({
        userId: req.user.id,
        examId,
        attemptType: "section_only",
        activeSectionId: sectionId,
        status: "in_progress",
        startedAt: new Date(),
      });

      // Initialize section status for only the active section
      attempt.sectionsStatus = [
        {
          sectionId: sectionId,
          status: "in_progress",
        },
      ];

      // Set expiresAt based on section duration (if available) or exam duration
      let durationMs;
      if (
        section &&
        typeof section.duration === "number" &&
        section.duration > 0
      ) {
        durationMs = section.duration * 60 * 1000; // section duration in minutes
      } else if (typeof exam.duration === "number" && exam.duration > 0) {
        // If no section duration, use exam duration divided by number of sections
        const sectionCount = exam.sections ? exam.sections.length : 1;
        durationMs = (exam.duration / sectionCount) * 60 * 1000;
      }

      if (durationMs) {
        attempt.expiresAt = new Date(attempt.startedAt.getTime() + durationMs);
      }

      await attempt.save();
    }

    // Auto-expire if past due
    if (
      attempt.expiresAt &&
      new Date(attempt.expiresAt) < new Date() &&
      attempt.status === "in_progress"
    ) {
      attempt.status = "expired";
      await attempt.save();
    }

    return res.json(attempt);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// Create a new attempt for an exam
router.post("/", async (req, res) => {
  try {
    const { examId } = req.body;
    if (!examId) return res.status(400).json({ error: "examId is required" });
    // Enforce max one in-progress per (user, exam) if desired
    const existingInProgress = await AttemptModel.findOne({
      userId: req.user.id,
      examId,
      status: "in_progress",
    });
    if (existingInProgress) {
      return res
        .status(409)
        .json({ error: "An in-progress attempt already exists for this exam" });
    }
    // Validate exam exists
    let exam;
    try {
      exam = await Exam.findById(examId);
      if (!exam) return res.status(404).json({ error: "Exam not found" });
    } catch (err) {
      if (err.name === "CastError") {
        return res.status(400).json({ error: "Invalid examId" });
      }
      throw err;
    }
    const attempt = new AttemptModel({
      userId: req.user.id,
      examId,
      attemptType: "full_exam",
      status: "in_progress",
      startedAt: new Date(),
    });
    // initialize per-section status
    try {
      const exam = await Exam.findById(examId);
      if (exam && Array.isArray(exam.sections)) {
        attempt.sectionsStatus = (exam.sections || []).map((sid) => ({
          sectionId: sid._id || sid,
          status: "in_progress",
        }));
      }
    } catch {}

    // set expiresAt based on exam duration (assumed minutes)
    if (typeof exam.duration === "number" && exam.duration > 0) {
      const ms = exam.duration * 60 * 1000;
      attempt.expiresAt = new Date(attempt.startedAt.getTime() + ms);
    }
    await attempt.save();
    res.status(201).json(attempt);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Upsert a response to a question within an attempt
router.post("/:id/response", async (req, res) => {
  try {
    const { id } = req.params;
    const { sectionId, partId, groupId, questionId, response, timeSpentMs } =
      req.body;
    const audioUrl = req.body.audioUrl || req.body.speakingAudioUrl;
    const transcript = req.body.transcript || req.body.speakingTranscript;
    if (!questionId)
      return res.status(400).json({ error: "questionId is required" });

    const attempt = await AttemptModel.findById(id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    if (String(attempt.userId) !== String(req.user.id))
      return res.status(403).json({ error: "Forbidden" });
    if (attempt.expiresAt && new Date(attempt.expiresAt) < new Date()) {
      if (attempt.status === "in_progress") {
        attempt.status = "expired";
        await attempt.save();
      }
      return res.status(400).json({ error: "Attempt expired" });
    }
    if (attempt.status !== "in_progress")
      return res.status(400).json({ error: "Attempt is not in progress" });

    // Find existing response for the same identifiers
    const matchIndex = attempt.responses.findIndex(
      (r) =>
        String(r.questionId) === String(questionId) &&
        (partId == null ||
          String(r.partId) === String(partId) ||
          r.partId == null) &&
        (groupId == null ||
          String(r.groupId) === String(groupId) ||
          r.groupId == null) &&
        (sectionId == null ||
          String(r.sectionId) === String(sectionId) ||
          r.sectionId == null)
    );

    // Disallow responses to submitted section
    if (sectionId && Array.isArray(attempt.sectionsStatus)) {
      const s = attempt.sectionsStatus.find(
        (x) => String(x.sectionId) === String(sectionId)
      );
      if (s && s.status === "submitted") {
        return res.status(400).json({ error: "Section already submitted" });
      }
    }

    // If speaking payload provided as separate fields, store both URL and transcript together
    let responsePayload = response;
    if (audioUrl || transcript) {
      responsePayload = {
        audioUrl: audioUrl || undefined,
        transcript: transcript || undefined,
      };
    }

    const newResp = {
      sectionId,
      partId,
      groupId,
      questionId,
      response: responsePayload,
      timeSpentMs,
    };
    if (matchIndex >= 0) {
      attempt.responses[matchIndex] = {
        ...(attempt.responses[matchIndex].toObject?.() ||
          attempt.responses[matchIndex]),
        ...newResp,
      };
    } else {
      attempt.responses.push(newResp);
    }

    await attempt.save();
    res.json({ message: "Saved" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Submit attempt
router.post("/:id/submit", async (req, res) => {
  try {
    const attempt = await AttemptModel.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    if (String(attempt.userId) !== String(req.user.id))
      return res.status(403).json({ error: "Forbidden" });
    if (attempt.expiresAt && new Date(attempt.expiresAt) < new Date()) {
      if (attempt.status === "in_progress") {
        attempt.status = "expired";
        await attempt.save();
      }
      return res.status(400).json({ error: "Attempt expired" });
    }
    if (
      attempt.status === "submitted" ||
      attempt.status === "graded" ||
      attempt.status === "cancelled"
    ) {
      return res.status(400).json({ error: "Attempt cannot be submitted" });
    }

    // Compute scoring snapshot (including scaled) before finalizing submission
    await attempt.computeScoring();

    // Update main attempt status
    attempt.status = "submitted";
    attempt.submittedAt = new Date();

    // Update all section statuses to "submitted" and compute their scores
    const now = new Date();
    if (attempt.sectionsStatus && attempt.sectionsStatus.length > 0) {
      for (let i = 0; i < attempt.sectionsStatus.length; i++) {
        const sectionStatus = attempt.sectionsStatus[i];
        if (sectionStatus.status === "in_progress") {
          sectionStatus.status = "submitted";
          sectionStatus.submittedAt = now;

          // Compute and update section scoring
          const sectionScore = await attempt.computeSectionScoring(
            sectionStatus.sectionId
          );
          sectionStatus.score = sectionScore.score || 0;
          sectionStatus.maxScore = sectionScore.maxScore || 0;
          sectionStatus.accuracy = sectionScore.accuracy || 0;
        }
      }
    }

    await attempt.save();
    res.json(attempt);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get data needed to resume an attempt (ownership enforced)
router.get("/:id/resume", async (req, res) => {
  try {
    const attempt = await AttemptModel.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    if (String(attempt.userId) !== String(req.user.id))
      return res.status(403).json({ error: "Forbidden" });

    // Optionally compute remaining time if expiresAt is set
    let remainingMs;
    if (attempt.expiresAt) {
      remainingMs = Math.max(0, new Date(attempt.expiresAt) - Date.now());
    }

    return res.json({
      attempt,
      remainingMs,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Save a client-side snapshot/state for an in-progress attempt
router.post("/:id/snapshot", async (req, res) => {
  try {
    const attempt = await AttemptModel.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    if (String(attempt.userId) !== String(req.user.id))
      return res.status(403).json({ error: "Forbidden" });
    if (attempt.expiresAt && new Date(attempt.expiresAt) < new Date()) {
      if (attempt.status === "in_progress") {
        attempt.status = "expired";
        await attempt.save();
      }
      return res.status(400).json({ error: "Attempt expired" });
    }
    if (attempt.status !== "in_progress")
      return res
        .status(400)
        .json({ error: "Only in-progress attempts can save snapshot" });

    attempt.snapshot = req.body?.snapshot ?? req.body;
    await attempt.save();
    return res.json({ message: "Snapshot saved" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Submit a single section within an attempt
router.post("/:id/sections/:sectionId/submit", async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const attempt = await AttemptModel.findById(id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    if (String(attempt.userId) !== String(req.user.id))
      return res.status(403).json({ error: "Forbidden" });
    if (attempt.expiresAt && new Date(attempt.expiresAt) < new Date()) {
      if (attempt.status === "in_progress") {
        attempt.status = "expired";
        await attempt.save();
      }
      return res.status(400).json({ error: "Attempt expired" });
    }
    if (!Array.isArray(attempt.sectionsStatus)) attempt.sectionsStatus = [];
    const idx = attempt.sectionsStatus.findIndex(
      (s) => String(s.sectionId) === String(sectionId)
    );
    const now = new Date();
    if (idx >= 0) {
      attempt.sectionsStatus[idx].status = "submitted";
      attempt.sectionsStatus[idx].submittedAt = now;
    } else {
      attempt.sectionsStatus.push({
        sectionId,
        status: "submitted",
        submittedAt: now,
      });
    }
    // Compute and persist section scoring snapshot on submission
    const sectionScore = await attempt.computeSectionScoring(sectionId);
    const targetIdx = attempt.sectionsStatus.findIndex(
      (s) => String(s.sectionId) === String(sectionId)
    );
    if (targetIdx >= 0) {
      attempt.sectionsStatus[targetIdx].score = sectionScore.score || 0;
      attempt.sectionsStatus[targetIdx].maxScore = sectionScore.maxScore || 0;
      attempt.sectionsStatus[targetIdx].accuracy = sectionScore.accuracy || 0;
    }

    // For section-only attempts, mark the entire attempt as submitted when section is submitted
    if (attempt.attemptType === "section_only") {
      attempt.status = "submitted";
      attempt.submittedAt = now;
    }

    await attempt.save();
    res.json({
      message: "Section submitted",
      sectionsStatus: attempt.sectionsStatus,
      attemptType: attempt.attemptType,
      attemptStatus: attempt.status,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Grade a specific section within an attempt
router.post("/:id/sections/:sectionId/grade", async (req, res) => {
  try {
    const { id, sectionId } = req.params;
    const attempt = await AttemptModel.findById(id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    if (String(attempt.userId) !== String(req.user.id))
      return res.status(403).json({ error: "Forbidden" });

    // Section must be submitted or attempt submitted/graded
    const s = (attempt.sectionsStatus || []).find(
      (x) => String(x.sectionId) === String(sectionId)
    );
    const isSectionSubmitted = s?.status === "submitted";
    const isAttemptFinalized =
      attempt.status === "submitted" || attempt.status === "graded";
    if (!isSectionSubmitted && !isAttemptFinalized) {
      return res
        .status(400)
        .json({ error: "Section must be submitted before grading" });
    }

    const sectionScore = await attempt.computeSectionScoring(sectionId);
    // Persist updated overall scoring cache
    await attempt.save();
    return res.json(sectionScore);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// Cancel attempt
router.post("/:id/cancel", async (req, res) => {
  try {
    const attempt = await AttemptModel.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    if (String(attempt.userId) !== String(req.user.id))
      return res.status(403).json({ error: "Forbidden" });
    if (attempt.status !== "in_progress")
      return res
        .status(400)
        .json({ error: "Only in-progress attempts can be cancelled" });
    attempt.status = "cancelled";
    await attempt.save();
    res.json(attempt);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Expire attempt (server/admin action)
// Manually expire a specific attempt
router.post("/:id/expire", async (req, res) => {
  try {
    const { reason, force = false } = req.body;
    const attempt = await AttemptModel.findById(req.params.id);

    if (!attempt) return res.status(404).json({ error: "Attempt not found" });

    // Check permissions - owner or admin/tutor
    if (
      String(attempt.userId) !== String(req.user.id) &&
      !["admin", "tutor"].includes(req.user.role)
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // Check if attempt can be expired
    if (!force && attempt.status !== "in_progress") {
      return res.status(400).json({
        error: "Only in-progress attempts can be expired",
        currentStatus: attempt.status,
      });
    }

    // Update attempt status
    const previousStatus = attempt.status;
    attempt.status = "expired";

    // Add expiration metadata
    attempt.expiredAt = new Date();
    if (reason) {
      attempt.expirationReason = reason;
    }
    if (req.user.id !== attempt.userId) {
      attempt.expiredBy = req.user.id;
    }

    await attempt.save();

    // Return comprehensive response
    const response = {
      attempt: {
        _id: attempt._id,
        userId: attempt.userId,
        examId: attempt.examId,
        status: attempt.status,
        previousStatus,
        startedAt: attempt.startedAt,
        expiredAt: attempt.expiredAt,
        expirationReason: attempt.expirationReason,
        expiredBy: attempt.expiredBy,
      },
      timeInfo: {
        duration: attempt.startedAt
          ? new Date(attempt.expiredAt) - new Date(attempt.startedAt)
          : null,
        wasOverdue: attempt.expiresAt
          ? new Date(attempt.expiresAt) < new Date()
          : false,
      },
    };

    res.json(response);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Admin-only: expire all overdue in-progress attempts
router.post("/expire-overdue", async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Forbidden" });
    const now = new Date();
    const result = await AttemptModel.updateMany(
      { status: "in_progress", expiresAt: { $lt: now } },
      { $set: { status: "expired", expiredAt: now, expiredBy: req.user.id } }
    );
    res.json({
      matched: result.matchedCount ?? result.n,
      modified: result.modifiedCount ?? result.nModified,
      expiredAt: now,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get exam status and time remaining for a specific attempt
router.get("/:id/status", async (req, res) => {
  try {
    const attempt = await AttemptModel.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (String(attempt.userId) !== String(req.user.id))
      return res.status(403).json({ error: "Forbidden" });

    const now = new Date();
    let remainingMs = null;
    let isExpired = false;
    let timeStatus = "unknown";

    if (attempt.expiresAt) {
      remainingMs = Math.max(0, new Date(attempt.expiresAt) - now);
      isExpired = remainingMs === 0;

      if (isExpired) {
        timeStatus = "expired";
      } else if (remainingMs < 5 * 60 * 1000) {
        // Less than 5 minutes
        timeStatus = "critical";
      } else if (remainingMs < 15 * 60 * 1000) {
        // Less than 15 minutes
        timeStatus = "warning";
      } else {
        timeStatus = "normal";
      }
    }

    const response = {
      attempt: {
        _id: attempt._id,
        status: attempt.status,
        startedAt: attempt.startedAt,
        expiresAt: attempt.expiresAt,
        submittedAt: attempt.submittedAt,
        expiredAt: attempt.expiredAt,
      },
      timeInfo: {
        remainingMs,
        isExpired,
        timeStatus,
        totalDuration:
          attempt.startedAt && attempt.expiresAt
            ? new Date(attempt.expiresAt) - new Date(attempt.startedAt)
            : null,
        elapsed: attempt.startedAt ? now - new Date(attempt.startedAt) : null,
      },
      progress: {
        sectionsTotal: attempt.sectionsStatus?.length || 0,
        sectionsCompleted:
          attempt.sectionsStatus?.filter((s) => s.status === "submitted")
            .length || 0,
        responsesCount: attempt.responses?.length || 0,
      },
    };

    res.json(response);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get all attempts for a specific exam by user
router.get("/exam/:examId", async (req, res) => {
  try {
    const { examId } = req.params;
    const { status } = req.query;

    // Build query
    const query = { userId: req.user.id, examId };
    if (status) {
      query.status = status;
    }

    // Get attempts
    const attempts = await AttemptModel.find(query)
      .sort({ createdAt: -1 })
      .select("-responses -snapshot"); // Exclude large fields for list view

    // Get exam info
    const exam = await Exam.findById(examId).select("title type duration");

    res.json({
      attempts,
      exam,
      total: attempts.length,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Cancel an in-progress attempt
router.post("/:id/cancel", async (req, res) => {
  try {
    const { reason } = req.body;
    const attempt = await AttemptModel.findById(req.params.id);

    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (String(attempt.userId) !== String(req.user.id))
      return res.status(403).json({ error: "Forbidden" });
    if (attempt.status !== "in_progress")
      return res.status(400).json({
        error: "Only in-progress attempts can be cancelled",
        currentStatus: attempt.status,
      });

    attempt.status = "cancelled";
    attempt.cancelledAt = new Date();
    if (reason) {
      attempt.cancellationReason = reason;
    }

    await attempt.save();

    res.json({
      attempt: {
        _id: attempt._id,
        status: attempt.status,
        cancelledAt: attempt.cancelledAt,
        cancellationReason: attempt.cancellationReason,
      },
      message: "Attempt cancelled successfully",
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get exam flow statistics for a user
router.get("/stats/overview", async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    // Get basic stats
    const totalAttempts = await AttemptModel.countDocuments({ userId });
    const inProgressAttempts = await AttemptModel.countDocuments({
      userId,
      status: "in_progress",
    });
    const submittedAttempts = await AttemptModel.countDocuments({
      userId,
      status: "submitted",
    });
    const gradedAttempts = await AttemptModel.countDocuments({
      userId,
      status: "graded",
    });
    const expiredAttempts = await AttemptModel.countDocuments({
      userId,
      status: "expired",
    });

    // Get recent attempts
    const recentAttempts = await AttemptModel.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("examId status startedAt submittedAt createdAt")
      .populate("examId", "title type");

    // Get overdue attempts
    const overdueAttempts = await AttemptModel.find({
      userId,
      status: "in_progress",
      expiresAt: { $lt: now },
    }).select("examId expiresAt startedAt");

    res.json({
      overview: {
        total: totalAttempts,
        inProgress: inProgressAttempts,
        submitted: submittedAttempts,
        graded: gradedAttempts,
        expired: expiredAttempts,
        overdue: overdueAttempts.length,
      },
      recentAttempts,
      overdueAttempts: overdueAttempts.map((attempt) => ({
        _id: attempt._id,
        examId: attempt.examId,
        startedAt: attempt.startedAt,
        expiresAt: attempt.expiresAt,
        overdueBy: now - new Date(attempt.expiresAt),
      })),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Timeline analytics (basic)
router.get("/:id/timeline", async (req, res) => {
  try {
    const attempt = await AttemptModel.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    if (String(attempt.userId) !== String(req.user.id))
      return res.status(403).json({ error: "Forbidden" });
    const totals = {
      timeMs:
        attempt.startedAt && attempt.submittedAt
          ? new Date(attempt.submittedAt) - new Date(attempt.startedAt)
          : undefined,
    };
    const responses = (attempt.responses || []).map((r) => ({
      questionId: r.questionId,
      timeSpentMs: r.timeSpentMs,
    }));
    res.json({ totals, responses });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get attempts for current user (optionally filter by examId or status)
router.get("/", async (req, res) => {
  try {
    const { examId, status, attemptType } = req.query;
    const query = { userId: req.user.id };
    if (examId) query.examId = examId;
    if (status) query.status = status;
    if (attemptType) query.attemptType = attemptType;
    const items = await AttemptModel.find(query).sort({ createdAt: -1 });
    res.json({ items, total: items.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get attempts by type (section-only or full exam)
router.get("/by-type/:attemptType", async (req, res) => {
  try {
    const { attemptType } = req.params;
    const { examId, status } = req.query;

    if (!["full_exam", "section_only"].includes(attemptType)) {
      return res.status(400).json({
        error: "Invalid attemptType. Must be 'full_exam' or 'section_only'",
      });
    }

    const query = {
      userId: req.user.id,
      attemptType: attemptType,
    };
    if (examId) query.examId = examId;
    if (status) query.status = status;

    const items = await AttemptModel.find(query).sort({ createdAt: -1 });

    res.json({
      items,
      total: items.length,
      attemptType: attemptType,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get section-only attempts for a specific section
router.get("/sections/:sectionId", async (req, res) => {
  try {
    const { sectionId } = req.params;
    const { status } = req.query;

    const query = {
      userId: req.user.id,
      attemptType: "section_only",
      activeSectionId: sectionId,
    };
    if (status) query.status = status;

    const items = await AttemptModel.find(query).sort({ createdAt: -1 });

    res.json({
      items,
      total: items.length,
      sectionId: sectionId,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get a specific attempt (ownership enforced)
router.get("/:id", async (req, res) => {
  try {
    const attempt = await AttemptModel.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    if (
      String(attempt.userId) !== String(req.user.id) &&
      req.user.role !== "admin"
    )
      return res.status(403).json({ error: "Forbidden" });
    res.json(attempt);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Grade an attempt (compute correctness and scores)
router.post("/:id/grade", async (req, res) => {
  try {
    const attempt = await AttemptModel.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    if (String(attempt.userId) !== String(req.user.id))
      return res.status(403).json({ error: "Forbidden" });
    if (attempt.status !== "submitted" && attempt.status !== "graded")
      return res
        .status(400)
        .json({ error: "Attempt must be submitted before grading" });

    // Build lookup maps for quick grading
    const exam = await Exam.findById(attempt.examId);
    if (!exam) return res.status(404).json({ error: "Exam not found" });
    const sections = await Section.find({ _id: { $in: exam.sections } });
    const partIds = sections.flatMap((s) => s.parts.map((p) => p._id || p));
    const parts = await Part.find({ _id: { $in: partIds } });
    const groupIds = parts.flatMap((p) =>
      p.questionGroups.map((g) => g._id || g)
    );
    const groups = await QuestionGroup.find({ _id: { $in: groupIds } });

    const questionMap = new Map();
    for (const g of groups) {
      for (const q of g.questions || []) {
        questionMap.set(String(q._id), { q, group: g });
      }
    }

    let score = 0;
    let maxScore = 0;
    const perQuestion = [];

    // Process all responses in parallel for better performance
    const responsePromises = attempt.responses.map(async (r) => {
      const entry = questionMap.get(String(r.questionId));
      if (!entry) return null;

      const { q, group } = entry;
      const weight = typeof q.weight === "number" ? q.weight : 1;
      const correctAnswer = q.correctAnswer;
      const given =
        normalizeQuestionType(q.questionType) === "speaking" &&
        r?.response &&
        typeof r.response === "object"
          ? r.response.transcript || r.response.audioUrl || r.response
          : r.response;

      // Get section info for AI evaluation
      const section = sections.find((s) =>
        s.parts.some((p) => p._id.toString() === r.partId.toString())
      );
      const sectionType = section?.sectionType || "Writing";

      const isCorrect = await compareAnswers(
        q.questionType,
        given,
        correctAnswer,
        exam.type || "IELTS",
        sectionType,
        q.question || ""
      );
      const earned = isCorrect ? weight : 0;

      return {
        questionId: r.questionId,
        sectionId: r.sectionId,
        partId: r.partId,
        groupId: r.groupId,
        sectionType: sectionType,
        isCorrect,
        earned,
        max: weight,
      };
    });

    // Wait for all responses to be processed
    const responseResults = await Promise.all(responsePromises);

    // Process the results
    for (const result of responseResults) {
      if (!result) continue;

      score += result.earned;
      maxScore += result.max;
      perQuestion.push({
        questionId: result.questionId,
        sectionId: result.sectionId,
        partId: result.partId,
        groupId: result.groupId,
        isCorrect: result.isCorrect,
        earned: result.earned,
        max: result.max,
      });
    }

    const accuracy = maxScore > 0 ? score / maxScore : 0;
    // Enhanced scaled scores per exam type with more accurate conversion
    const examType = String(exam.type || "").toLowerCase();
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    // Calculate section-specific scores according to real exam standards
    let scaled;
    const sectionBandScores = {};

    if (examType.includes("ielts")) {
      // IELTS: Use official grading system
      const sections = ["Listening", "Reading", "Writing", "Speaking"];
      const sectionBands = {};
      const testType = exam.type === "IELTS_GT" ? "general" : "academic";

      for (const section of sections) {
        const sectionResponses = responseResults.filter(
          (r) =>
            r.sectionType &&
            r.sectionType.toLowerCase() === section.toLowerCase()
        );

        if (sectionResponses.length > 0) {
          // Use official IELTS grading
          const sectionResult = gradeIELTSSection(
            sectionResponses,
            section,
            testType
          );
          sectionBands[section] = sectionResult.bandScore;
          sectionBandScores[section] = sectionResult.bandScore;
        }
      }

      // Calculate overall band with proper rounding
      const overallBand = calculateOverallBand(sectionBands);

      scaled = {
        type: "IELTS",
        score: overallBand,
        sectionScores: sectionBandScores,
        testType: testType,
      };
    } else if (examType.includes("toefl")) {
      // TOEFL: Each section scored 0-30, then summed for total
      const sections = ["Reading", "Listening", "Speaking", "Writing"];
      const sectionScaledScores = [];

      for (const section of sections) {
        const sectionResponses = responseResults.filter(
          (r) =>
            r.sectionType &&
            r.sectionType.toLowerCase() === section.toLowerCase()
        );
        if (sectionResponses.length > 0) {
          const sectionAccuracy =
            sectionResponses.reduce(
              (sum, r) => sum + (r.isCorrect ? 1 : 0),
              0
            ) / sectionResponses.length;
          const sectionScore = Math.round(clamp(30 * sectionAccuracy, 0, 30));
          sectionBandScores[section] = sectionScore;
          sectionScaledScores.push(sectionScore);
        }
      }

      const totalScore = sectionScaledScores.reduce(
        (sum, score) => sum + score,
        0
      );
      scaled = {
        type: "TOEFL",
        score: totalScore,
        sectionScores: sectionBandScores,
      };
    } else if (examType.includes("gre")) {
      // GRE: Analytical Writing scored 0-6 in 0.5 increments
      const writingResponses = responseResults.filter(
        (r) => r.sectionType === "Writing"
      );
      if (writingResponses.length > 0) {
        const writingAccuracy =
          writingResponses.reduce((sum, r) => sum + (r.isCorrect ? 1 : 0), 0) /
          writingResponses.length;
        const writingScore =
          Math.round(clamp(6 * writingAccuracy, 0, 6) * 2) / 2;
        sectionBandScores["Analytical Writing"] = writingScore;
        scaled = {
          type: "GRE",
          score: writingScore,
          sectionScores: sectionBandScores,
        };
      } else {
        scaled = { type: "GRE", score: 0, sectionScores: sectionBandScores };
      }
    } else if (examType.includes("pte")) {
      // PTE: Communicative Skills (10-90) for each section
      const sections = ["Speaking", "Writing", "Reading", "Listening"];
      const communicativeScores = [];

      for (const section of sections) {
        const sectionResponses = responseResults.filter(
          (r) =>
            r.sectionType &&
            r.sectionType.toLowerCase() === section.toLowerCase()
        );
        if (sectionResponses.length > 0) {
          const sectionAccuracy =
            sectionResponses.reduce(
              (sum, r) => sum + (r.isCorrect ? 1 : 0),
              0
            ) / sectionResponses.length;
          const sectionScore = Math.round(
            clamp(10 + 80 * sectionAccuracy, 10, 90)
          );
          sectionBandScores[section] = sectionScore;
          communicativeScores.push(sectionScore);
        }
      }

      const overallScore =
        communicativeScores.length > 0
          ? Math.round(
              communicativeScores.reduce((sum, score) => sum + score, 0) /
                communicativeScores.length
            )
          : 10;
      scaled = {
        type: "PTE",
        score: overallScore,
        sectionScores: sectionBandScores,
      };
    }

    attempt.status = "graded";
    attempt.scoring = {
      score,
      maxScore,
      accuracy,
      perQuestion,
      scaled,
      bandScores: scaled?.sectionScores || {},
    };
    await attempt.save();
    res.json({
      score,
      maxScore,
      accuracy,
      scaled: attempt.scoring.scaled,
      bandScores: attempt.scoring.bandScores,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Manual grading: set correctness/score for specific question(s)
router.post("/:id/grade/manual", async (req, res) => {
  try {
    const attempt = await AttemptModel.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    // Only owner non-student (tutor/admin) or the owner themself if policy allows; here we restrict students
    if (req.user.role === "student")
      return res.status(403).json({ error: "Forbidden" });
    const { updates } = req.body; // [{ questionId (_id), earned, max, isCorrect, feedback }]
    if (!Array.isArray(updates) || updates.length === 0)
      return res.status(400).json({ error: "updates array is required" });

    if (!attempt.scoring)
      attempt.scoring = { score: 0, maxScore: 0, accuracy: 0, perQuestion: [] };
    const pq = attempt.scoring.perQuestion || [];
    // Map responses by questionId to recover section/part/group for manual updates
    const responseByQuestionId = new Map(
      (attempt.responses || []).map((r) => [String(r.questionId), r])
    );
    for (const u of updates) {
      const idx = pq.findIndex(
        (x) => String(x.questionId) === String(u.questionId)
      );
      if (idx >= 0) {
        const resp = responseByQuestionId.get(String(u.questionId));
        pq[idx] = {
          ...pq[idx],
          ...u,
          // Ensure section/part/group are populated when we can infer them
          sectionId: pq[idx].sectionId || resp?.sectionId || pq[idx].sectionId,
          partId: pq[idx].partId || resp?.partId || pq[idx].partId,
          groupId: pq[idx].groupId || resp?.groupId || pq[idx].groupId,
        };
      } else {
        const resp = responseByQuestionId.get(String(u.questionId));
        pq.push({
          questionId: u.questionId,
          sectionId: resp?.sectionId,
          partId: resp?.partId,
          groupId: resp?.groupId,
          earned: u.earned || 0,
          max: u.max || 0,
          isCorrect: !!u.isCorrect,
          feedback: u.feedback,
        });
      }
    }
    // Recompute totals
    const score = pq.reduce((s, x) => s + (Number(x.earned) || 0), 0);
    const maxScore = pq.reduce((s, x) => s + (Number(x.max) || 0), 0);
    const answered = pq.filter((x) => x.max > 0).length;
    const correct = pq.filter((x) => x.isCorrect).length;
    attempt.scoring.perQuestion = pq;
    attempt.scoring.score = score;
    attempt.scoring.maxScore = maxScore;
    attempt.scoring.accuracy =
      maxScore > 0 ? score / maxScore : answered > 0 ? correct / answered : 0;

    // Compute scaled scores
    const exam = await Exam.findById(attempt.examId);
    const examType = String(exam?.type || "").toLowerCase();
    const acc = attempt.scoring.accuracy || 0;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const IELTS = Math.round(clamp(9 * acc, 0, 9) * 2) / 2;
    const GRE = Math.round(clamp(6 * acc, 0, 6) * 2) / 2;
    const TOEFL = Math.round(clamp(30 * acc, 0, 30));
    const PTE = Math.round(clamp(10 + 80 * acc, 10, 90));
    
    // Ensure all scores are valid numbers (not NaN)
    const validIELTS = isNaN(IELTS) ? undefined : IELTS;
    const validGRE = isNaN(GRE) ? undefined : GRE;
    const validTOEFL = isNaN(TOEFL) ? undefined : TOEFL;
    const validPTE = isNaN(PTE) ? undefined : PTE;
    
    let primary;
    if (examType.includes("ielts") && validIELTS !== undefined) primary = { type: "IELTS", score: validIELTS };
    else if (examType.includes("gre") && validGRE !== undefined) primary = { type: "GRE", score: validGRE };
    else if (examType.includes("toefl") && validTOEFL !== undefined)
      primary = { type: "TOEFL", score: validTOEFL };
    else if (examType.includes("pte") && validPTE !== undefined) primary = { type: "PTE", score: validPTE };
    let scaled;
    if (examType.includes("ielts") && validIELTS !== undefined) scaled = { type: "IELTS", score: validIELTS };
    else if (examType.includes("gre") && validGRE !== undefined) scaled = { type: "GRE", score: validGRE };
    else if (examType.includes("toefl") && validTOEFL !== undefined)
      scaled = { type: "TOEFL", score: validTOEFL };
    else if (examType.includes("pte") && validPTE !== undefined) scaled = { type: "PTE", score: validPTE };
    attempt.scoring.scaled = scaled;

    // Update per-section aggregates in sectionsStatus based on perQuestion entries
    const bySection = new Map();
    for (const item of pq) {
      if (!item.sectionId) continue;
      const key = String(item.sectionId);
      const t = bySection.get(key) || { score: 0, max: 0 };
      t.score += Number(item.earned) || 0;
      t.max += Number(item.max) || 0;
      bySection.set(key, t);
    }

    if (!Array.isArray(attempt.sectionsStatus)) attempt.sectionsStatus = [];
    for (const [sid, t] of bySection.entries()) {
      const idx = attempt.sectionsStatus.findIndex(
        (s) => String(s.sectionId) === String(sid)
      );
      const accuracy = t.max > 0 ? t.score / t.max : 0;
      if (idx >= 0) {
        attempt.sectionsStatus[idx].score = t.score;
        attempt.sectionsStatus[idx].maxScore = t.max;
        attempt.sectionsStatus[idx].accuracy = accuracy;
        if (attempt.sectionsStatus[idx].status === "submitted") {
          attempt.sectionsStatus[idx].status = "graded";
        }
      } else {
        attempt.sectionsStatus.push({
          sectionId: sid,
          status: "graded",
          score: t.score,
          maxScore: t.max,
          accuracy,
        });
      }
    }
    attempt.status = "graded";
    await attempt.save();
    res.json(attempt.scoring);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Ingest grading results from an external evaluator for long answers/speaking
// Body: { updates: [{ questionId, earned, max, isCorrect, feedback, sectionId?, partId?, groupId? }], finalizeAttempt?: boolean }
router.post("/:id/grade/external", async (req, res) => {
  try {
    const attempt = await AttemptModel.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    // Only non-student roles can set grades programmatically
    if (req.user.role === "student")
      return res.status(403).json({ error: "Forbidden" });

    const { updates, finalizeAttempt = true } = req.body || {};
    if (!Array.isArray(updates) || updates.length === 0)
      return res.status(400).json({ error: "updates array is required" });

    if (!attempt.scoring)
      attempt.scoring = { score: 0, maxScore: 0, accuracy: 0, perQuestion: [] };
    const pq = attempt.scoring.perQuestion || [];
    const responseByQuestionId = new Map(
      (attempt.responses || []).map((r) => [String(r.questionId), r])
    );

    for (const u of updates) {
      if (!u || !u.questionId) continue;
      const idx = pq.findIndex(
        (x) => String(x.questionId) === String(u.questionId)
      );
      const resp = responseByQuestionId.get(String(u.questionId));
      const base = {
        questionId: u.questionId,
        sectionId: u.sectionId ?? resp?.sectionId,
        partId: u.partId ?? resp?.partId,
        groupId: u.groupId ?? resp?.groupId,
        earned: Number(u.earned) || 0,
        max: Number(u.max) || 0,
        isCorrect: Boolean(u.isCorrect),
        feedback: u.feedback,
      };
      if (idx >= 0) {
        pq[idx] = { ...pq[idx], ...base };
      } else {
        pq.push(base);
      }
    }

    // Recompute totals
    const score = pq.reduce((s, x) => s + (Number(x.earned) || 0), 0);
    const maxScore = pq.reduce((s, x) => s + (Number(x.max) || 0), 0);
    const answered = pq.filter((x) => x.max > 0).length;
    const correct = pq.filter((x) => x.isCorrect).length;
    attempt.scoring.perQuestion = pq;
    attempt.scoring.score = score;
    attempt.scoring.maxScore = maxScore;
    attempt.scoring.accuracy =
      maxScore > 0 ? score / maxScore : answered > 0 ? correct / answered : 0;

    // Update per-section aggregates and sectionsStatus
    const bySection = new Map();
    for (const item of pq) {
      if (!item.sectionId) continue;
      const key = String(item.sectionId);
      const t = bySection.get(key) || { score: 0, max: 0 };
      t.score += Number(item.earned) || 0;
      t.max += Number(item.max) || 0;
      bySection.set(key, t);
    }
    if (!Array.isArray(attempt.sectionsStatus)) attempt.sectionsStatus = [];
    for (const [sid, t] of bySection.entries()) {
      const sIdx = attempt.sectionsStatus.findIndex(
        (s) => String(s.sectionId) === String(sid)
      );
      const acc = t.max > 0 ? t.score / t.max : 0;
      if (sIdx >= 0) {
        attempt.sectionsStatus[sIdx].score = t.score;
        attempt.sectionsStatus[sIdx].maxScore = t.max;
        attempt.sectionsStatus[sIdx].accuracy = acc;
        if (attempt.sectionsStatus[sIdx].status === "submitted")
          attempt.sectionsStatus[sIdx].status = "graded";
      } else {
        attempt.sectionsStatus.push({
          sectionId: sid,
          status: "graded",
          score: t.score,
          maxScore: t.max,
          accuracy: acc,
        });
      }
    }

    if (finalizeAttempt) attempt.status = "graded";
    // Compute scaled scores
    const exam = await Exam.findById(attempt.examId);
    const examType = String(exam?.type || "").toLowerCase();
    const acc = attempt.scoring.accuracy || 0;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const IELTS = Math.round(clamp(9 * acc, 0, 9) * 2) / 2;
    const GRE = Math.round(clamp(6 * acc, 0, 6) * 2) / 2;
    const TOEFL = Math.round(clamp(30 * acc, 0, 30));
    const PTE = Math.round(clamp(10 + 80 * acc, 10, 90));
    
    // Ensure all scores are valid numbers (not NaN)
    const validIELTS = isNaN(IELTS) ? undefined : IELTS;
    const validGRE = isNaN(GRE) ? undefined : GRE;
    const validTOEFL = isNaN(TOEFL) ? undefined : TOEFL;
    const validPTE = isNaN(PTE) ? undefined : PTE;
    
    let primary;
    if (examType.includes("ielts") && validIELTS !== undefined) primary = { type: "IELTS", score: validIELTS };
    else if (examType.includes("gre") && validGRE !== undefined) primary = { type: "GRE", score: validGRE };
    else if (examType.includes("toefl") && validTOEFL !== undefined)
      primary = { type: "TOEFL", score: validTOEFL };
    else if (examType.includes("pte") && validPTE !== undefined) primary = { type: "PTE", score: validPTE };
    let scaled;
    if (examType.includes("ielts") && validIELTS !== undefined) scaled = { type: "IELTS", score: validIELTS };
    else if (examType.includes("gre") && validGRE !== undefined) scaled = { type: "GRE", score: validGRE };
    else if (examType.includes("toefl") && validTOEFL !== undefined)
      scaled = { type: "TOEFL", score: validTOEFL };
    else if (examType.includes("pte") && validPTE !== undefined) scaled = { type: "PTE", score: validPTE };
    attempt.scoring.scaled = scaled;
    await attempt.save();
    res.json({
      scoring: attempt.scoring,
      sectionsStatus: attempt.sectionsStatus,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Override entire scoring object (admin only)
router.patch("/:id/score", async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Forbidden" });
    const attempt = await AttemptModel.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    attempt.scoring = req.body;
    attempt.status = "graded";
    await attempt.save();
    res.json(attempt.scoring);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Summary endpoint for quick result view
router.get("/:id/summary", async (req, res) => {
  try {
    const attempt = await AttemptModel.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    if (String(attempt.userId) !== String(req.user.id))
      return res.status(403).json({ error: "Forbidden" });

    const { scoring, status, startedAt, submittedAt, sectionsStatus } = attempt;
    const timeMs =
      startedAt && submittedAt
        ? new Date(submittedAt) - new Date(startedAt)
        : undefined;
    res.json({
      status,
      score: scoring?.score || 0,
      maxScore: scoring?.maxScore || 0,
      accuracy: scoring?.accuracy || 0,
      scaled: scoring?.scaled,
      timeMs,
      sectionsStatus,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// AI-powered evaluator for text/speaking using GPT API
async function aiEvaluateText({
  examType,
  sectionType,
  questionText,
  modelAnswer,
  userAnswer,
  weight = 1,
}) {
  try {
    const cleaned = String(userAnswer || "").trim();
    if (!cleaned) {
      return { earned: 0, max: weight, feedback: "No answer provided" };
    }

    const prompt = `You are an expert, calibrated examiner for English language & standardized tests with deep knowledge of official scoring criteria.
You will receive input with these variables:

Exam_Type = ${examType}
Section = ${sectionType}
Question = ${questionText}
Model_Answer = ${modelAnswer}
User_Answer = ${userAnswer}

Your task is to evaluate the User_Answer using the EXACT official scoring criteria for this exam type and section, then normalize to [0,1].

---

### DETAILED OFFICIAL SCORING CRITERIA

**IELTS ACADEMIC**

**Writing Task 1 (Report Writing):**
- Task Achievement (25%): Complete task, clear overview, accurate data, appropriate comparisons
- Coherence & Cohesion (25%): Logical organization, clear progression, appropriate linking
- Lexical Resource (25%): Range and accuracy of vocabulary, collocation, spelling
- Grammatical Range & Accuracy (25%): Sentence variety, accuracy, complex structures

**Writing Task 2 (Essay):**
- Task Response (25%): Address all parts, clear position, relevant ideas, examples
- Coherence & Cohesion (25%): Clear structure, logical flow, cohesive devices
- Lexical Resource (25%): Sophisticated vocabulary, natural usage, word formation
- Grammatical Range & Accuracy (25%): Complex sentences, accuracy, flexibility

**Speaking:**
- Fluency & Coherence (25%): Natural pace, hesitation, self-correction, topic development
- Lexical Resource (25%): Range, precision, paraphrasing, collocation
- Grammatical Range & Accuracy (25%): Complex structures, accuracy, flexibility
- Pronunciation (25%): Intelligibility, word stress, sentence stress, intonation

**TOEFL iBT**

**Speaking (0-4 scale per task):**
- Delivery: Clear pronunciation, natural pace, good intonation
- Language Use: Grammar accuracy, vocabulary range and precision
- Topic Development: Complete response, clear progression, relevant details

**Writing (0-5 scale per task):**
- Integrated Writing: Accurate summary, clear connections, language use
- Independent Writing: Clear position, well-developed ideas, organization, language use

**PTE ACADEMIC**

**Writing:**
- Content: Addresses prompt, relevant ideas, appropriate length
- Form: Correct format, word count, structure
- Vocabulary: Range, accuracy, appropriateness
- Grammar: Accuracy, range, complexity
- Spelling: Correct spelling throughout

**Speaking:**
- Content: Addresses prompt, relevant ideas
- Oral Fluency: Natural pace, smooth delivery, appropriate pausing
- Pronunciation: Clear, intelligible, natural stress and intonation
- Vocabulary: Range, accuracy, appropriateness
- Grammar: Accuracy, range, complexity

**GRE ANALYTICAL WRITING**

**Issue Task & Argument Task (0-6 scale):**
- Clarity: Clear thesis, logical organization, effective transitions
- Reasoning: Strong arguments, relevant examples, critical analysis
- Language Use: Precise vocabulary, varied sentence structure, few errors
- Organization: Clear structure, logical flow, effective development

---

### EVALUATION PROCESS

1. **Analyze each criterion** for the specific exam and section
2. **Score each criterion** using the official scale (IELTS 0-9, TOEFL 0-4/5, PTE 0-90, GRE 0-6)
3. **Calculate weighted average** based on official weightings
4. **Normalize to [0,1]** by dividing by maximum possible score
5. **Be strict but fair** - use official standards, not lenient interpretation

**CRITICAL**: Output ONLY a decimal number between 0.0 and 1.0. No explanation, no text, just the number.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: prompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 10,
    });

    const scoreText = response.choices[0]?.message?.content?.trim();
    const normalizedScore = parseFloat(scoreText);

    if (isNaN(normalizedScore) || normalizedScore < 0 || normalizedScore > 1) {
      // Fallback to heuristic if AI response is invalid
      return heuristicEvaluateText({
        text: userAnswer,
        correct: modelAnswer,
        weight,
      });
    }

    const earned = Math.round(normalizedScore * weight * 100) / 100;
    const feedback = `AI Evaluation: ${(normalizedScore * 100).toFixed(
      1
    )}% (${examType} ${sectionType})`;

    return { earned, max: weight, feedback };
  } catch (error) {
    console.error("AI evaluation error:", error);
    // Fallback to heuristic evaluation
    return heuristicEvaluateText({
      text: userAnswer,
      correct: modelAnswer,
      weight,
    });
  }
}

// Fallback heuristic evaluator for when AI is unavailable
function heuristicEvaluateText({
  text,
  correct,
  weight = 1,
  minWords = 30,
  maxWords = 300,
}) {
  try {
    const cleaned = String(text || "").trim();
    if (!cleaned)
      return { earned: 0, max: weight, feedback: "No answer provided" };
    const wc = cleaned.split(/\s+/).filter(Boolean).length;
    let lengthRatio = 1;
    if (wc < minWords) {
      const deficit = Math.min(minWords - wc, minWords);
      lengthRatio = Math.max(0.5, 1 - deficit / minWords);
    } else if (wc > maxWords) {
      const excess = Math.min(wc - maxWords, maxWords);
      lengthRatio = Math.max(0.5, 1 - excess / maxWords);
    }
    const lc = cleaned.toLowerCase();
    const ref = String(correct || "").toLowerCase();
    const refTokens = Array.from(
      new Set(ref.split(/[^a-z0-9]+/).filter((t) => t.length > 3))
    );
    let matched = 0;
    for (const t of refTokens) if (lc.includes(t)) matched += 1;
    const coverageRatio = refTokens.length ? matched / refTokens.length : 1;
    const combined = 0.7 * coverageRatio + 0.3 * lengthRatio;
    const earned = Math.round(combined * weight * 100) / 100;
    const feedback = `Heuristic: keywords ${matched}/${
      refTokens.length || 0
    }; words ${wc} (target ${minWords}-${maxWords})`;
    return { earned, max: weight, feedback };
  } catch {
    return { earned: 0, max: weight, feedback: "Evaluation error" };
  }
}

// Detailed review: user answer vs correct answer
router.get("/:id/review", async (req, res) => {
  try {
    const attempt = await AttemptModel.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    if (
      req.user.role == "student" &&
      String(attempt.userId) !== String(req.user.id)
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const exam = await Exam.findById(attempt.examId);
    if (!exam) return res.status(404).json({ error: "Exam not found" });

    // Map responses by questionId for quick lookup
    const responseByQuestionId = new Map();
    for (const r of attempt.responses) {
      responseByQuestionId.set(String(r.questionId), r);
    }

    // Load nested docs
    const sections = await Section.find({ _id: { $in: exam.sections } });
    const parts = await Part.find({
      _id: { $in: sections.flatMap((s) => s.parts) },
    });
    const groups = await QuestionGroup.find({
      _id: { $in: parts.flatMap((p) => p.questionGroups) },
    });

    // Build maps
    const partsById = new Map(parts.map((p) => [String(p._id), p]));
    const groupsById = new Map(groups.map((g) => [String(g._id), g]));

    // Assemble full exam structure with annotations
    const examObj = exam.toObject();
    examObj.sections = await Promise.all(
      sections.map(async (section) => {
        const sectionObj = section.toObject();
        sectionObj.parts = await Promise.all(
          (section.parts || [])
            .map(async (pid) => {
              const partDoc = partsById.get(String(pid._id || pid));
              if (!partDoc) return null;
              const partObj = partDoc.toObject();
              partObj.questionGroups = await Promise.all(
                (partObj.questionGroups || [])
                  .map(async (gid) => {
                    const groupDoc = groupsById.get(String(gid._id || gid));
                    if (!groupDoc) return null;
                    const groupObj = groupDoc.toObject();
                    groupObj.questions = await Promise.all(
                      (groupObj.questions || []).map(async (q) => {
                        const key2 = String(q._id);
                        const resp = responseByQuestionId.get(key2);

                        const isCorrect = resp
                          ? await compareAnswers(
                              q.questionType,
                              resp.response,
                              q.correctAnswer,
                              exam.type || "IELTS",
                              section.sectionType || "Writing",
                              q.question || ""
                            )
                          : false;
                        return {
                          ...q,
                          userResponse: resp?.response,
                          isCorrect,
                          timeSpentMs: resp?.timeSpentMs,
                        };
                      })
                    );
                    return groupObj;
                  })
                  .filter(Boolean)
              );
              return partObj;
            })
            .filter(Boolean)
        );
        return sectionObj;
      })
    );

    return res.json({
      exam: examObj,
      attempt: {
        _id: attempt._id,
        status: attempt.status,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        scoring: attempt.scoring,
        sectionsStatus: attempt.sectionsStatus,
      },
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Normalize incoming question types (from seeds, UI, etc.) to canonical set
function normalizeQuestionType(type) {
  const t = String(type || "").toLowerCase();
  switch (t) {
    case "mcq":
    case "single":
    case "single_choice":
    case "single-select":
    case "multiple_choice_1_answer":
      return "single";
    case "multi":
    case "multiple":
    case "multi-select":
    case "multiple_choice_multiple_answer":
    case "checkbox":
      return "multi";
    case "order":
    case "reorder":
    case "arrange":
    case "sequence":
      return "order";
    case "text":
    case "short-answer":
    case "typing":
    case "fill_in_blank":
    case "fill-in-the-blank":
      return "text";
    case "long":
    case "long-answer":
    case "long_answer":
    case "essay":
      return "long";
    case "speaking":
    case "speech":
      return "speaking";
    default:
      return t;
  }
}

// Helper: compare answers by canonical type (async for AI evaluation)
async function compareAnswers(
  type,
  given,
  correct,
  examType = "IELTS",
  sectionType = "Writing",
  questionText = ""
) {
  try {
    if (correct == null) return false;
    switch (normalizeQuestionType(type)) {
      case "single":
        return String(given).toLowerCase() === String(correct).toLowerCase();
      case "multi": {
        const a = Array.isArray(given) ? [...given].map(String).sort() : [];
        const b = Array.isArray(correct) ? [...correct].map(String).sort() : [];
        return JSON.stringify(a) === JSON.stringify(b);
      }
      case "order": {
        const a = Array.isArray(given) ? given.map(Number) : [];
        const b = Array.isArray(correct) ? correct.map(Number) : [];
        if (a.length !== b.length) return false;
        return a.every((v, i) => v === b[i]);
      }
      case "text": {
        const normalize = (s) =>
          String(s || "")
            .trim()
            .toLowerCase();
        return normalize(given) === normalize(correct);
      }
      case "long": {
        const suggested = await aiEvaluateText({
          examType,
          sectionType,
          questionText,
          modelAnswer: correct,
          userAnswer: given,
          weight: 1,
        });
        // More realistic thresholds for writing tasks
        const threshold = sectionType.toLowerCase().includes("writing")
          ? 0.3
          : 0.6;
        return (suggested?.earned ?? 0) >= threshold * (suggested?.max ?? 1);
      }
      case "speaking":
        // If given is an audio URL, cannot auto-grade here
        if (typeof given === "string" && /^https?:\/\//i.test(given))
          return false;
        // If given is transcribed text, use AI evaluation
        const suggested = await aiEvaluateText({
          examType,
          sectionType,
          questionText,
          modelAnswer: correct,
          userAnswer: given,
          weight: 1,
        });
        // More realistic thresholds for speaking tasks
        const threshold = sectionType.toLowerCase().includes("speaking")
          ? 0.4
          : 0.6;
        return (suggested?.earned ?? 0) >= threshold * (suggested?.max ?? 1);
      default:
        return String(given) === String(correct);
    }
  } catch {
    return false;
  }
}
module.exports = router;
