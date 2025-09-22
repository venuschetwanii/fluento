const { Schema, model } = require("mongoose");
const Exam = require("./exam.model");
const Section = require("./section.model");
const Part = require("./part.model");
const QuestionGroup = require("./group.model");
const ResponseSchema = new Schema(
  {
    sectionId: Schema.Types.ObjectId,
    partId: Schema.Types.ObjectId,
    groupId: Schema.Types.ObjectId,
    questionId: Schema.Types.ObjectId,
    response: Schema.Types.Mixed,
    timeSpentMs: Number,
  },
  { _id: false }
);
const PerQuestionScoreSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    sectionId: { type: Schema.Types.ObjectId },
    partId: { type: Schema.Types.ObjectId },
    groupId: { type: Schema.Types.ObjectId },
    earned: { type: Number, default: 0 },
    max: { type: Number, default: 0 },
    isCorrect: { type: Boolean, default: false },
    feedback: { type: String },
  },
  { _id: false }
);

const ScoringSchema = new Schema(
  {
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    perQuestion: { type: [PerQuestionScoreSchema], default: [] },
    sectionScores: {
      type: [
        new Schema(
          {
            sectionId: { type: Schema.Types.ObjectId, required: true },
            score: { type: Number, default: 0 },
            maxScore: { type: Number, default: 0 },
            accuracy: { type: Number, default: 0 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { _id: false }
);

const AttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    examId: { type: String, ref: "Exam", index: true },
    status: {
      type: String,
      enum: ["in_progress", "submitted", "graded", "expired", "cancelled"],
      default: "in_progress",
    },
    startedAt: { type: Date, default: Date.now },
    expiresAt: Date,
    submittedAt: Date,
    snapshot: Schema.Types.Mixed,
    sectionsStatus: [
      {
        sectionId: { type: Schema.Types.ObjectId, required: true },
        status: {
          type: String,
          enum: ["in_progress", "submitted"],
          default: "in_progress",
        },
        submittedAt: Date,
        score: { type: Number, default: 0 },
        maxScore: { type: Number, default: 0 },
        accuracy: { type: Number, default: 0 },
      },
    ],
    responses: [ResponseSchema],
    scoring: ScoringSchema,
  },
  { timestamps: true }
);

// Helper functions colocated for model-based scoring
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
        return false;
      default:
        return String(given) === String(correct);
    }
  } catch {
    return false;
  }
}

// Compute scoring from current responses and referenced exam content
AttemptSchema.methods.computeScoring = async function () {
  const attempt = this;

  // Load exam structure
  const exam = await Exam.findById(attempt.examId);
  if (!exam)
    return (
      attempt.scoring || { score: 0, maxScore: 0, accuracy: 0, perQuestion: [] }
    );

  const sections = await Section.find({ _id: { $in: exam.sections } });
  const partIds = sections.flatMap((s) => s.parts.map((p) => p._id || p));
  const parts = await Part.find({ _id: { $in: partIds } });
  const groupIds = parts.flatMap((p) =>
    p.questionGroups.map((g) => g._id || g)
  );
  const groups = await QuestionGroup.find({ _id: { $in: groupIds } });

  // Build question map by embedded _id
  const questionIdToQuestion = new Map();
  for (const g of groups) {
    for (const q of g.questions || []) {
      questionIdToQuestion.set(String(q._id), { q, group: g });
    }
  }

  let totalScore = 0;
  let totalMax = 0;
  const perQuestion = [];
  const sectionTotals = new Map();

  for (const r of attempt.responses || []) {
    const entry = questionIdToQuestion.get(String(r.questionId));
    if (!entry) continue;
    const { q } = entry;
    const weight = typeof q.weight === "number" ? q.weight : 1;
    const isCorrect = compareAnswers(
      q.questionType,
      r.response,
      q.correctAnswer
    );
    const earned = isCorrect ? weight : 0;

    totalScore += earned;
    totalMax += weight;

    perQuestion.push({
      questionId: r.questionId,
      sectionId: r.sectionId,
      partId: r.partId,
      groupId: r.groupId,
      isCorrect,
      earned,
      max: weight,
    });

    if (r.sectionId) {
      const key = String(r.sectionId);
      const t = sectionTotals.get(key) || { score: 0, max: 0 };
      t.score += earned;
      t.max += weight;
      sectionTotals.set(key, t);
    }
  }

  const accuracy = totalMax > 0 ? totalScore / totalMax : 0;
  const sectionScores = Array.from(sectionTotals.entries()).map(([sid, t]) => ({
    sectionId: sid,
    score: t.score,
    maxScore: t.max,
    accuracy: t.max > 0 ? t.score / t.max : 0,
  }));
  attempt.scoring = {
    score: totalScore,
    maxScore: totalMax,
    accuracy,
    perQuestion,
    sectionScores,
  };

  return attempt.scoring;
};

AttemptSchema.methods.computeSectionScoring = async function (sectionId) {
  const all = (await this.computeScoring()) || {};
  if (!all.sectionScores)
    return { sectionId, score: 0, maxScore: 0, accuracy: 0 };
  const found = all.sectionScores.find(
    (s) => String(s.sectionId) === String(sectionId)
  );
  return found || { sectionId, score: 0, maxScore: 0, accuracy: 0 };
};

// Convenience: compute scoring and persist, optionally updating status
AttemptSchema.methods.gradeNow = async function (finalize = true) {
  await this.computeScoring();
  if (finalize) {
    this.status = "graded";
  }
  await this.save();
  return this.scoring;
};

module.exports = model("Attempt", AttemptSchema);
