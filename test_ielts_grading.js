const {
  convertRawScoreToBand,
  calculateOverallBand,
  gradeIELTSSection,
  gradeIELTSExam,
  getBandDescription,
} = require("./src/services/ielts-grading.service");

// Test data
const mockResponses = {
  listening: [
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: false },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: false },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
  ], // 38/40 correct
  reading: [
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true },
  ], // 40/40 correct
  writing: [
    { isCorrect: true },
    { isCorrect: true }, // Task 1 and Task 2
  ],
  speaking: [
    { isCorrect: true },
    { isCorrect: true },
    { isCorrect: true }, // 3 parts
  ],
};

console.log("🎯 IELTS Official Grading System Test\n");

// Test 1: Individual Section Grading
console.log("📊 Section-Level Grading:");
console.log("========================");

const listeningResult = gradeIELTSSection(
  mockResponses.listening,
  "listening",
  "academic"
);
console.log("Listening:", listeningResult);

const readingResult = gradeIELTSSection(
  mockResponses.reading,
  "reading",
  "academic"
);
console.log("Reading:", readingResult);

const writingResult = gradeIELTSSection(
  mockResponses.writing,
  "writing",
  "academic"
);
console.log("Writing:", writingResult);

const speakingResult = gradeIELTSSection(
  mockResponses.speaking,
  "speaking",
  "academic"
);
console.log("Speaking:", speakingResult);

// Test 2: Overall Band Calculation
console.log("\n🎖️ Overall Band Calculation:");
console.log("============================");

const sectionBands = {
  listening: listeningResult.bandScore,
  reading: readingResult.bandScore,
  writing: writingResult.bandScore,
  speaking: speakingResult.bandScore,
};

const overallBand = calculateOverallBand(sectionBands);
console.log("Section Bands:", sectionBands);
console.log("Overall Band:", overallBand);

// Test 3: Band Descriptions
console.log("\n📝 Band Score Descriptions:");
console.log("===========================");

Object.entries(sectionBands).forEach(([section, band]) => {
  const description = getBandDescription(band);
  console.log(`${section}: ${band} - ${description.level}`);
});

const overallDescription = getBandDescription(overallBand);
console.log(`Overall: ${overallBand} - ${overallDescription.level}`);

// Test 4: Academic vs General Training
console.log("\n📚 Academic vs General Training:");
console.log("================================");

const academicReading = gradeIELTSSection(
  mockResponses.reading,
  "reading",
  "academic"
);
const generalReading = gradeIELTSSection(
  mockResponses.reading,
  "reading",
  "general"
);

console.log("Academic Reading (40/40):", academicReading.bandScore);
console.log("General Reading (40/40):", generalReading.bandScore);

// Test 5: Different Raw Scores
console.log("\n🔢 Raw Score Conversion Examples:");
console.log("=================================");

const testScores = [40, 39, 35, 30, 25, 20, 15, 10, 5, 0];
testScores.forEach((score) => {
  const listeningBand = convertRawScoreToBand(score, "listening");
  const readingAcademicBand = convertRawScoreToBand(
    score,
    "reading",
    "academic"
  );
  const readingGeneralBand = convertRawScoreToBand(score, "reading", "general");

  console.log(
    `Raw ${score}: Listening=${listeningBand}, Reading(Academic)=${readingAcademicBand}, Reading(General)=${readingGeneralBand}`
  );
});

// Test 6: Complete Exam Grading
console.log("\n📋 Complete Exam Grading:");
console.log("========================");

const completeExamResult = gradeIELTSExam(mockResponses, "academic");
console.log("Complete Exam Result:");
console.log(JSON.stringify(completeExamResult, null, 2));

console.log("\n✅ IELTS Grading System Test Complete!");
