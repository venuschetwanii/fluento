const mongoose = require("mongoose");
const { Schema } = mongoose;

// Question Schema (embedded in groups)
const QuestionSchema = new Schema({
  question: { type: String, required: true },
  questionType: { type: String, required: true },
  options: [{ type: String }],
  maxWords: { type: Number },
  minWords: { type: Number },
  maxTime: { type: Number },
  scoringCriteria: [{ type: String }],
  taskType: { type: String },
  textItems: [{ type: String }],
  audioUrl: { type: String },
  // Answer and grading metadata
  correctAnswer: Schema.Types.Mixed,
  weight: { type: Number, default: 1 },
  explanation: { type: String },
});

// Question Group Schema
const QuestionGroupSchema = new Schema(
  {
    groupNumber: { type: Number },
    groupName: { type: String },
    questionType: { type: String, required: true },
    directionText: { type: String, required: true },
    answerList: { type: String, default: null },
    questionBox: { type: String, default: null },
    passageText: { type: String },
    imageUrl: { type: String },
    audioUrl: { type: String },
    textItems: [{ type: String }],
    image: { type: Schema.Types.Mixed },

    // Embedded questions
    questions: [QuestionSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("QuestionGroup", QuestionGroupSchema);
