/**
 * IELTS Official Grading Service
 * Implements official IELTS band score conversion tables and calculation rules
 */

// Official IELTS Raw Score to Band Conversion Tables
const LISTENING_CONVERSION = {
  39: 9,
  40: 9,
  37: 8.5,
  38: 8.5,
  35: 8,
  36: 8,
  30: 7,
  31: 7,
  32: 7,
  33: 7,
  34: 7,
  26: 6.5,
  27: 6.5,
  28: 6.5,
  29: 6.5,
  23: 6,
  24: 6,
  25: 6,
  18: 5.5,
  19: 5.5,
  20: 5.5,
  21: 5.5,
  22: 5.5,
  16: 5,
  17: 5,
  13: 4.5,
  14: 4.5,
  15: 4.5,
  10: 4,
  11: 4,
  12: 4,
  8: 3.5,
  9: 3.5,
  6: 3,
  7: 3,
  4: 2.5,
  5: 2.5,
  2: 2,
  3: 2,
  1: 1.5,
  0: 0,
};

const READING_ACADEMIC_CONVERSION = {
  39: 9,
  40: 9,
  37: 8.5,
  38: 8.5,
  35: 8,
  36: 8,
  30: 7,
  31: 7,
  32: 7,
  33: 7,
  34: 7,
  27: 6.5,
  28: 6.5,
  29: 6.5,
  23: 6,
  24: 6,
  25: 6,
  26: 6,
  19: 5.5,
  20: 5.5,
  21: 5.5,
  22: 5.5,
  15: 5,
  16: 5,
  17: 5,
  18: 5,
  13: 4.5,
  14: 4.5,
  10: 4,
  11: 4,
  12: 4,
  8: 3.5,
  9: 3.5,
  6: 3,
  7: 3,
  4: 2.5,
  5: 2.5,
  2: 2,
  3: 2,
  1: 1.5,
  0: 0,
};

const READING_GENERAL_CONVERSION = {
  40: 9,
  39: 8.5,
  37: 8,
  38: 8,
  36: 7.5,
  34: 7,
  35: 7,
  32: 6.5,
  33: 6.5,
  30: 6,
  31: 6,
  27: 5.5,
  28: 5.5,
  29: 5.5,
  23: 5,
  24: 5,
  25: 5,
  26: 5,
  19: 4.5,
  20: 4.5,
  21: 4.5,
  22: 4.5,
  15: 4,
  16: 4,
  17: 4,
  18: 4,
  12: 3.5,
  13: 3.5,
  14: 3.5,
  9: 3,
  10: 3,
  11: 3,
  6: 2.5,
  7: 2.5,
  8: 2.5,
  4: 2,
  5: 2,
  2: 1.5,
  3: 1.5,
  1: 1,
  0: 0,
};

/**
 * Convert raw score to IELTS band score
 * @param {number} rawScore - Raw score (0-40)
 * @param {string} section - Section type (listening, reading, writing, speaking)
 * @param {string} testType - Test type (academic, general)
 * @returns {number} Band score (0-9)
 */
function convertRawScoreToBand(rawScore, section, testType = "academic") {
  const score = Math.round(rawScore);

  switch (section.toLowerCase()) {
    case "listening":
      return LISTENING_CONVERSION[score] || 0;

    case "reading":
      if (testType.toLowerCase() === "general") {
        return READING_GENERAL_CONVERSION[score] || 0;
      }
      return READING_ACADEMIC_CONVERSION[score] || 0;

    case "writing":
    case "speaking":
      // For writing and speaking, we need to use AI evaluation or manual grading
      // This would return a band score based on the 4 criteria
      return calculateWritingSpeakingBand(rawScore, section);

    default:
      return 0;
  }
}

/**
 * Calculate Writing/Speaking band score based on 4 criteria
 * @param {Object} criteria - Object with 4 criteria scores (0-9 each)
 * @param {string} section - Section type (writing, speaking)
 * @returns {number} Band score (0-9)
 */
function calculateWritingSpeakingBand(criteria, section) {
  const { taskAchievement, coherence, lexical, grammar } = criteria;

  // Average of 4 criteria, rounded to nearest 0.5
  const average = (taskAchievement + coherence + lexical + grammar) / 4;
  return Math.round(average * 2) / 2;
}

/**
 * Calculate Writing section band with Task 2 weighting
 * @param {number} task1Band - Task 1 band score
 * @param {number} task2Band - Task 2 band score
 * @returns {number} Overall Writing band score
 */
function calculateWritingBand(task1Band, task2Band) {
  // Task 2 is weighted twice as much as Task 1
  const weightedScore = (task1Band + 2 * task2Band) / 3;
  return Math.round(weightedScore * 2) / 2;
}

/**
 * Calculate overall IELTS band score with proper rounding
 * @param {Object} sectionBands - Object with section band scores
 * @returns {number} Overall band score
 */
function calculateOverallBand(sectionBands) {
  const { listening, reading, writing, speaking } = sectionBands;

  // Calculate average
  const average = (listening + reading + writing + speaking) / 4;

  // Apply official rounding rules
  const decimal = average % 1;

  if (decimal >= 0.25 && decimal < 0.75) {
    return Math.floor(average) + 0.5;
  } else if (decimal >= 0.75) {
    return Math.ceil(average);
  } else {
    return Math.floor(average);
  }
}

/**
 * Grade a single IELTS section
 * @param {Array} responses - Array of user responses
 * @param {string} sectionType - Section type (listening, reading, writing, speaking)
 * @param {string} testType - Test type (academic, general)
 * @returns {Object} Section grading result
 */
function gradeIELTSSection(responses, sectionType, testType = "academic") {
  const totalQuestions = responses.length;
  const correctAnswers = responses.filter((r) => r.isCorrect).length;
  const rawScore = correctAnswers;

  let bandScore;

  if (
    sectionType.toLowerCase() === "writing" ||
    sectionType.toLowerCase() === "speaking"
  ) {
    // For writing/speaking, use AI evaluation or manual grading
    bandScore = calculateWritingSpeakingBand(
      {
        taskAchievement: 7, // This would come from AI evaluation
        coherence: 7,
        lexical: 7,
        grammar: 7,
      },
      sectionType
    );
  } else {
    // For listening/reading, use conversion table
    bandScore = convertRawScoreToBand(rawScore, sectionType, testType);
  }

  return {
    sectionType,
    totalQuestions,
    correctAnswers,
    rawScore,
    bandScore,
    accuracy: totalQuestions > 0 ? correctAnswers / totalQuestions : 0,
  };
}

/**
 * Grade complete IELTS exam
 * @param {Object} examData - Complete exam data with all sections
 * @param {string} testType - Test type (academic, general)
 * @returns {Object} Complete IELTS grading result
 */
function gradeIELTSExam(examData, testType = "academic") {
  const sections = ["listening", "reading", "writing", "speaking"];
  const sectionResults = {};
  const sectionBands = {};

  // Grade each section
  for (const section of sections) {
    const sectionResponses = examData[section] || [];
    const sectionResult = gradeIELTSSection(
      sectionResponses,
      section,
      testType
    );
    sectionResults[section] = sectionResult;
    sectionBands[section] = sectionResult.bandScore;
  }

  // Calculate overall band
  const overallBand = calculateOverallBand(sectionBands);

  return {
    testType,
    sectionResults,
    sectionBands,
    overallBand,
    summary: {
      listening: sectionBands.listening,
      reading: sectionBands.reading,
      writing: sectionBands.writing,
      speaking: sectionBands.speaking,
      overall: overallBand,
    },
  };
}

/**
 * Get detailed band score description
 * @param {number} bandScore - Band score (0-9)
 * @returns {Object} Band score description
 */
function getBandDescription(bandScore) {
  const descriptions = {
    9: {
      level: "Expert User",
      description: "Has fully operational command of the language",
    },
    8.5: {
      level: "Very Good User",
      description:
        "Has fully operational command with only occasional unsystematic inaccuracies",
    },
    8: {
      level: "Very Good User",
      description:
        "Has fully operational command with only occasional unsystematic inaccuracies",
    },
    7.5: {
      level: "Good User",
      description:
        "Has operational command of the language, though with occasional inaccuracies",
    },
    7: {
      level: "Good User",
      description:
        "Has operational command of the language, though with occasional inaccuracies",
    },
    6.5: {
      level: "Competent User",
      description:
        "Has generally effective command despite some inaccuracies and misunderstandings",
    },
    6: {
      level: "Competent User",
      description:
        "Has generally effective command despite some inaccuracies and misunderstandings",
    },
    5.5: {
      level: "Modest User",
      description:
        "Has partial command of the language, coping with overall meaning in most situations",
    },
    5: {
      level: "Modest User",
      description:
        "Has partial command of the language, coping with overall meaning in most situations",
    },
    4.5: {
      level: "Limited User",
      description: "Basic competence is limited to familiar situations",
    },
    4: {
      level: "Limited User",
      description: "Basic competence is limited to familiar situations",
    },
    3.5: {
      level: "Extremely Limited User",
      description:
        "Conveys and understands only general meaning in very familiar situations",
    },
    3: {
      level: "Extremely Limited User",
      description:
        "Conveys and understands only general meaning in very familiar situations",
    },
    2.5: {
      level: "Intermittent User",
      description:
        "No real communication is possible except for the most basic information",
    },
    2: {
      level: "Intermittent User",
      description:
        "No real communication is possible except for the most basic information",
    },
    1.5: {
      level: "Non User",
      description:
        "Essentially has no ability to use the language beyond possibly a few isolated words",
    },
    1: {
      level: "Non User",
      description:
        "Essentially has no ability to use the language beyond possibly a few isolated words",
    },
    0: {
      level: "Did not attempt",
      description: "Did not answer the questions",
    },
  };

  return (
    descriptions[bandScore] || {
      level: "Unknown",
      description: "Invalid band score",
    }
  );
}

module.exports = {
  convertRawScoreToBand,
  calculateWritingSpeakingBand,
  calculateWritingBand,
  calculateOverallBand,
  gradeIELTSSection,
  gradeIELTSExam,
  getBandDescription,
  LISTENING_CONVERSION,
  READING_ACADEMIC_CONVERSION,
  READING_GENERAL_CONVERSION,
};
