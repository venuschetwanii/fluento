const { Schema, model } = require("mongoose");
const Exam = require("./exam.model");
const Section = require("./section.model");
const Part = require("./part.model");
const QuestionGroup = require("./group.model");
const OpenAI = require("openai");

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    // Scaled score for the exam (derived from accuracy)
    scaled: {
      type: new Schema(
        {
          type: { type: String }, // e.g., IELTS, GRE, TOEFL, PTE
          score: { type: Number },
        },
        { _id: false }
      ),
      default: undefined,
    },
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
    attemptType: {
      type: String,
      enum: ["full_exam", "section_only"],
      default: "full_exam",
      index: true,
    },
    activeSectionId: { type: Schema.Types.ObjectId, ref: "Section" },
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

  // Process all responses in parallel for better performance
  const responsePromises = (attempt.responses || []).map(async (r) => {
    const entry = questionIdToQuestion.get(String(r.questionId));
    if (!entry) return null;

    const { q, group } = entry;
    const weight = typeof q.weight === "number" ? q.weight : 1;

    // Get section info for AI evaluation
    const section = sections.find((s) =>
      s.parts.some((p) => p._id.toString() === r.partId.toString())
    );
    const sectionType = section?.sectionType || "Writing";

    const isCorrect = await compareAnswers(
      q.questionType,
      r.response,
      q.correctAnswer,
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
      sectionTotalsKey: r.sectionId ? String(r.sectionId) : null,
    };
  });

  // Wait for all responses to be processed
  const responseResults = await Promise.all(responsePromises);

  // Process the results
  for (const result of responseResults) {
    if (!result) continue;

    totalScore += result.earned;
    totalMax += result.max;
    perQuestion.push({
      questionId: result.questionId,
      sectionId: result.sectionId,
      partId: result.partId,
      groupId: result.groupId,
      isCorrect: result.isCorrect,
      earned: result.earned,
      max: result.max,
    });

    if (result.sectionTotalsKey) {
      const t = sectionTotals.get(result.sectionTotalsKey) || {
        score: 0,
        max: 0,
      };
      t.score += result.earned;
      t.max += result.max;
      sectionTotals.set(result.sectionTotalsKey, t);
    }
  }

  const accuracy = totalMax > 0 ? totalScore / totalMax : 0;
  // Enhanced scaled scores per exam type with more accurate conversion
  const examType = String(exam.type || "").toLowerCase();
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  // Calculate section-specific scores according to real exam standards
  let scaled;
  const sectionBandScores = {};

  if (examType.includes("ielts")) {
    // IELTS: Calculate individual section bands (0-9), then average
    const sections = ["Listening", "Reading", "Writing", "Speaking"];
    const sectionBands = [];

    for (const section of sections) {
      const sectionResponses = responseResults.filter(
        (r) =>
          r.sectionType && r.sectionType.toLowerCase() === section.toLowerCase()
      );
      if (sectionResponses.length > 0) {
        const sectionAccuracy =
          sectionResponses.reduce((sum, r) => sum + (r.isCorrect ? 1 : 0), 0) /
          sectionResponses.length;
        const sectionBand =
          Math.round(clamp(9 * sectionAccuracy, 0, 9) * 2) / 2;
        sectionBands.push(sectionBand);
        sectionBandScores[section] = sectionBand;
      }
    }

    const overallBand =
      sectionBands.length > 0
        ? Math.round(
            (sectionBands.reduce((sum, band) => sum + band, 0) /
              sectionBands.length) *
              2
          ) / 2
        : 0;
    scaled = {
      type: "IELTS",
      score: overallBand,
      sectionScores: sectionBandScores,
    };
  } else if (examType.includes("toefl")) {
    // TOEFL: Each section scored 0-30, then summed for total
    const sections = ["Reading", "Listening", "Speaking", "Writing"];
    const sectionScaledScores = [];

    for (const section of sections) {
      const sectionResponses = responseResults.filter(
        (r) =>
          r.sectionType && r.sectionType.toLowerCase() === section.toLowerCase()
      );
      if (sectionResponses.length > 0) {
        const sectionAccuracy =
          sectionResponses.reduce((sum, r) => sum + (r.isCorrect ? 1 : 0), 0) /
          sectionResponses.length;
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
      (r) => r.sectionType && r.sectionType.toLowerCase() === "writing"
    );
    if (writingResponses.length > 0) {
      const writingAccuracy =
        writingResponses.reduce((sum, r) => sum + (r.isCorrect ? 1 : 0), 0) /
        writingResponses.length;
      const writingScore = Math.round(clamp(6 * writingAccuracy, 0, 6) * 2) / 2;
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
          r.sectionType && r.sectionType.toLowerCase() === section.toLowerCase()
      );
      if (sectionResponses.length > 0) {
        const sectionAccuracy =
          sectionResponses.reduce((sum, r) => sum + (r.isCorrect ? 1 : 0), 0) /
          sectionResponses.length;
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
    scaled,
    sectionScores,
    bandScores: scaled?.sectionScores || {},
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
