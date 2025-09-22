const { Schema, model } = require("mongoose");
const mongoose = require("mongoose");

const PartSchema = new Schema(
  {
    type: String,
    directionText: String,
    audioUrl: String,
    context: String,
    questionGroups: [
      { type: mongoose.Schema.Types.ObjectId, ref: "QuestionGroup" },
    ],
  },
  { timestamps: true, _id: true }
);

module.exports = model("Part", PartSchema);
