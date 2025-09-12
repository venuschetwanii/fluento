const Router = require("express").Router;
const AttemptModel = require("../models/attempt.model");
const auth = require("../middlewares/auth.middleware");
const Exam = require("../models/exam.model");
const Section = require("../models/section.model");
const Part = require("../models/part.model");
const QuestionGroup = require("../models/group.model");

const router = Router();

// Require authentication for all attempt endpoints
router.use(auth);

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
    try {
      const exam = await Exam.findById(examId);
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
    if (!questionId)
      return res.status(400).json({ error: "questionId is required" });

    const attempt = await AttemptModel.findById(id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    if (String(attempt.userId) !== String(req.user.id))
      return res.status(403).json({ error: "Forbidden" });
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

    const newResp = {
      sectionId,
      partId,
      groupId,
      questionId,
      response,
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
    attempt.status = "submitted";
    attempt.submittedAt = new Date();
    await attempt.save();
    res.json(attempt);
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
    await attempt.save();
    res.json({
      message: "Section submitted",
      sectionsStatus: attempt.sectionsStatus,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
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
router.post("/:id/expire", async (req, res) => {
  try {
    const attempt = await AttemptModel.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    // Allow owner or elevated roles; simple check here assumes middleware role present
    if (
      String(attempt.userId) !== String(req.user.id) &&
      req.user.role === "student"
    )
      return res.status(403).json({ error: "Forbidden" });
    attempt.status = "expired";
    await attempt.save();
    res.json(attempt);
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
    const { examId, status, page = 1, limit = 20 } = req.query;
    const query = { userId: req.user.id };
    if (examId) query.examId = examId;
    if (status) query.status = status;
    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      AttemptModel.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      AttemptModel.countDocuments(query),
    ]);
    res.json({ items, total, page: Number(page), limit: Number(limit) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Get a specific attempt (ownership enforced)
router.get("/:id", async (req, res) => {
  try {
    const attempt = await AttemptModel.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    if (String(attempt.userId) !== String(req.user.id))
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
        questionMap.set(String(q.questionId), { q, group: g });
      }
    }

    let score = 0;
    let maxScore = 0;
    const perQuestion = [];
    for (const r of attempt.responses) {
      const entry = questionMap.get(String(r.questionId));
      if (!entry) continue;
      const { q } = entry;
      const weight = typeof q.weight === "number" ? q.weight : 1;
      const correctAnswer = q.correctAnswer;
      const isCorrect = compareAnswers(
        q.questionType,
        r.response,
        correctAnswer
      );
      const earned = isCorrect ? weight : 0;
      score += earned;
      maxScore += weight;
      perQuestion.push({
        questionId: r.questionId,
        sectionId: r.sectionId,
        partId: r.partId,
        groupId: r.groupId,
        isCorrect,
        earned,
        max: weight,
      });
    }

    const accuracy = maxScore > 0 ? score / maxScore : 0;
    attempt.status = "graded";
    attempt.scoring = { score, maxScore, accuracy, perQuestion };
    await attempt.save();
    res.json({ score, maxScore, accuracy });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Manual grading: set correctness/score for specific question(s)
router.post("/:id/grade/manual", async (req, res) => {
  try {
    const attempt = await AttemptModel.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    // Only owner non-student (teacher/admin) or the owner themself if policy allows; here we restrict students
    if (req.user.role === "student")
      return res.status(403).json({ error: "Forbidden" });
    const { updates } = req.body; // [{ questionId, earned, max, isCorrect, feedback }]
    if (!Array.isArray(updates) || updates.length === 0)
      return res.status(400).json({ error: "updates array is required" });

    if (!attempt.scoring)
      attempt.scoring = { score: 0, maxScore: 0, accuracy: 0, perQuestion: [] };
    const pq = attempt.scoring.perQuestion || [];
    for (const u of updates) {
      const idx = pq.findIndex(
        (x) => String(x.questionId) === String(u.questionId)
      );
      if (idx >= 0) {
        pq[idx] = { ...pq[idx], ...u };
      } else {
        pq.push({
          questionId: u.questionId,
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
    attempt.status = "graded";
    await attempt.save();
    res.json(attempt.scoring);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Override entire scoring object (admin only)
router.patch("/:id/score", async (req, res) => {
  try {
    if (req.user.role !== "admin" && req.user.role !== "moderator")
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
      timeMs,
      sectionsStatus,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Detailed review: user answer vs correct answer
router.get("/:id/review", async (req, res) => {
  try {
    const attempt = await AttemptModel.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: "Not found" });
    if (String(attempt.userId) !== String(req.user.id))
      return res.status(403).json({ error: "Forbidden" });

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
    examObj.sections = sections.map((section) => {
      const sectionObj = section.toObject();
      sectionObj.parts = (section.parts || [])
        .map((pid) => {
          const partDoc = partsById.get(String(pid._id || pid));
          if (!partDoc) return null;
          const partObj = partDoc.toObject();
          partObj.questionGroups = (partObj.questionGroups || [])
            .map((gid) => {
              const groupDoc = groupsById.get(String(gid._id || gid));
              if (!groupDoc) return null;
              const groupObj = groupDoc.toObject();
              groupObj.questions = (groupObj.questions || []).map((q) => {
                const key2 = String(q._id);
                const resp = responseByQuestionId.get(key2);
                const isCorrect = resp
                  ? compareAnswers(
                      q.questionType,
                      resp.response,
                      q.correctAnswer
                    )
                  : false;
                return {
                  ...q,
                  userResponse: resp?.response,
                  isCorrect,
                  timeSpentMs: resp?.timeSpentMs,
                };
              });
              return groupObj;
            })
            .filter(Boolean);
          return partObj;
        })
        .filter(Boolean);
      return sectionObj;
    });

    return res.json({
      exam: examObj,
      attempt: {
        _id: attempt._id,
        status: attempt.status,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        scoring: attempt.scoring,
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
    case "speaking":
    case "speech":
      return "speaking";
    default:
      return t;
  }
}

// Helper: compare answers by canonical type
function compareAnswers(type, given, correct) {
  try {
    if (correct == null) return false;
    switch (normalizeQuestionType(type)) {
      case "single":
        return String(given) === String(correct);
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
      case "speaking":
        // Speaking typically requires manual or ML grading; do not auto-grade
        return false;
      default:
        return String(given) === String(correct);
    }
  } catch {
    return false;
  }
}
module.exports = router;
