import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import { questionDataLookup, getExamData, partDataLookup } from "./constant.js";

// Import your models
import Exam from "../src/models/exam.model.js";
import Section from "../src/models/section.model.js";
import Part from "../src/models/part.model.js";
import QuestionGroup from "../src/models/group.model.js"; // Note: model name is 'group'

const seedDatabase = async () => {
  try {
    console.log("[v2] Starting database seeding with updated schemas...");

    // Connect to MongoDB
    await mongoose.connect(
      process.env.MONGO_URI || "mongodb://localhost:27017/exam-system"
    );
    console.log("[v2] Connected to MongoDB");

    // Clear existing data
    await Exam.deleteMany({});
    await Section.deleteMany({});
    await Part.deleteMany({});
    await QuestionGroup.deleteMany({});
    console.log("[v2] Cleared existing data");

    // Get a specific exam data set to seed
    const examData = getExamData("sdads-adasd-asdaad");
    if (!examData) {
      console.error("[v2] Error: Exam data not found for the specified ID.");
      await mongoose.disconnect();
      return;
    }

    // --- Step 1: Create a single Exam document ---
    console.log("[v2] Seeding Exam document...");
    const examDoc = {
      _id: examData.id,
      title: examData.title,
      type: examData.type,
      duration: examData.duration,
      totalQuestions: examData.totalQuestions,
      sections: [], // Will be populated with section ObjectIds
    };
    const savedExam = await Exam.create(examDoc);
    console.log(
      `[v2] Exam "${savedExam.title}" created with ID: ${savedExam._id}`
    );

    // --- Step 2: Iterate through exam data to create Sections, Parts, and Groups ---
    const sectionsToCreate = [];
    const partsToCreate = [];
    const groupsToCreate = [];

    for (const section of examData.sections) {
      console.log(`[v2] Processing section: ${section.sectionType}`);

      // Create a Section document
      const sectionDoc = {
        _id: new mongoose.Types.ObjectId(), // Create a new ObjectId for the section
        id: section.id,
        examType: section.examType,
        sectionType: section.sectionType,
        title: section.title,
        duration: section.duration,
        totalQuestions: section.totalQuestions,
        instructions: section.instructions,
        parts: [], // Will be populated with part ObjectIds
      };

      if (section.parts) {
        for (const partId of section.parts) {
          const partData = partDataLookup[partId];
          if (!partData) {
            console.warn(
              `[v2] Warning: Part ${partId} not found in partDataLookup`
            );
            continue;
          }

          // Create a Part document
          const partDoc = {
            _id: new mongoose.Types.ObjectId(), // Create a new ObjectId for the part
            id: partData.id,
            type: partData.type,
            directionText: partData.directionText,
            audioUrl: partData.audioUrl,
            context: partData.context || "",
            questionGroups: [], // Will be populated with group ObjectIds
          };

          // Process groups for this part
          if (partData.groups) {
            for (const groupData of partData.groups) {
              // Create a Group document
              const groupDoc = {
                _id: new mongoose.Types.ObjectId(), // Create a new ObjectId for the group
                id: groupData.id,
                groupNumber: groupData.groupNumber,
                groupName: groupData.groupName,
                questionType: groupData.questionType,
                directionText: groupData.directionText,
                answerList: groupData.answerList,
                questionBox: groupData.questionBox,
                passageText: groupData.passageText || "",
                imageUrl: groupData.imageUrl || null,
                audioUrl: groupData.audioUrl || null,
                textItems: groupData.textItems || [],
                image: groupData.image || null,
                questions: [], // Embedded questions
              };

              // Populate embedded questions from constant.js
              if (groupData.questions) {
                const embeddedQuestions = groupData.questions.map(
                  (questionId) => {
                    const qData = questionDataLookup[questionId];
                    return {
                      questionId: qData.id,
                      question: qData.question,
                      questionType: qData.questionType,
                      options: qData.options || undefined,
                      maxWords: qData.maxWords || undefined,
                      minWords: qData.minWords || undefined,
                      maxTime: qData.maxTime || undefined,
                      scoringCriteria: qData.scoringCriteria || undefined,
                      taskType: qData.taskType || undefined,
                      textItems: qData.textItems || undefined,
                      correctOrder: qData.correctOrder || undefined,
                      audioUrl: qData.audioUrl || undefined,
                    };
                  }
                );
                groupDoc.questions = embeddedQuestions;
              }

              groupsToCreate.push(groupDoc);
              partDoc.questionGroups.push(groupDoc._id); // Link group to part
            }
          }
          partsToCreate.push(partDoc);
          sectionDoc.parts.push(partDoc._id); // Link part to section
        }
      }
      sectionsToCreate.push(sectionDoc);
      savedExam.sections.push(sectionDoc._id); // Link section to exam
    }

    // --- Step 3: Insert all documents into their respective collections ---
    console.log("[v2] Inserting documents into collections...");
    await Section.insertMany(sectionsToCreate);
    await Part.insertMany(partsToCreate);
    await QuestionGroup.insertMany(groupsToCreate);
    await savedExam.save(); // Save the exam to update the sections array

    console.log(
      `[v2] Seeding completed for Exam "${savedExam.title}" with ${sectionsToCreate.length} sections, ${partsToCreate.length} parts, and ${groupsToCreate.length} question groups.`
    );
    console.log("[v2] Database seeding completed successfully!");
  } catch (error) {
    console.error("[v2] Error seeding database:", error);
  } finally {
    await mongoose.disconnect();
    console.log("[v2] Disconnected from MongoDB");
  }
};

seedDatabase();
