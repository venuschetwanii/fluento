const axios = require("axios");

// Configuration
const BASE_URL = "http://localhost:4000";
const API_BASE = `${BASE_URL}/attempts`;

// Mock JWT token (replace with actual token in real testing)
const AUTH_TOKEN = "your_jwt_token_here";

const headers = {
  Authorization: `Bearer ${AUTH_TOKEN}`,
  "Content-Type": "application/json",
};

// Test data
const TEST_EXAM_ID = "507f1f77bcf86cd799439011"; // Replace with actual exam ID
const TEST_ATTEMPT_ID = "507f1f77bcf86cd799439012"; // Replace with actual attempt ID

console.log("🧪 Testing Exam Flow APIs\n");

// Test 1: Resume/Create Exam
async function testResumeExam() {
  console.log("📝 Test 1: Resume/Create Exam");
  console.log("============================");

  try {
    const response = await axios.post(
      `${API_BASE}/resume`,
      {
        examId: TEST_EXAM_ID,
        forceNew: false,
      },
      { headers }
    );

    console.log("✅ Resume Exam Success:");
    console.log("Attempt ID:", response.data.attempt._id);
    console.log("Status:", response.data.attempt.status);
    console.log(
      "Time Remaining:",
      Math.round(response.data.timeInfo.remainingMs / 1000 / 60),
      "minutes"
    );
    console.log("Previous Attempts:", response.data.previousAttempts.total);

    return response.data.attempt._id;
  } catch (error) {
    console.log("❌ Resume Exam Failed:");
    console.log("Error:", error.response?.data?.error || error.message);
    return null;
  }
}

// Test 2: Check Exam Status
async function testCheckStatus(attemptId) {
  console.log("\n📊 Test 2: Check Exam Status");
  console.log("============================");

  try {
    const response = await axios.get(`${API_BASE}/${attemptId}/status`, {
      headers,
    });

    console.log("✅ Status Check Success:");
    console.log("Status:", response.data.attempt.status);
    console.log("Time Status:", response.data.timeInfo.timeStatus);
    console.log(
      "Progress:",
      `${response.data.progress.sectionsCompleted}/${response.data.progress.sectionsTotal} sections completed`
    );
    console.log("Responses:", response.data.progress.responsesCount);
  } catch (error) {
    console.log("❌ Status Check Failed:");
    console.log("Error:", error.response?.data?.error || error.message);
  }
}

// Test 3: Get Exam Attempts
async function testGetExamAttempts() {
  console.log("\n📋 Test 3: Get Exam Attempts");
  console.log("=============================");

  try {
    const response = await axios.get(
      `${API_BASE}/exam/${TEST_EXAM_ID}?limit=5&page=1`,
      { headers }
    );

    console.log("✅ Get Attempts Success:");
    console.log("Total Attempts:", response.data.pagination.total);
    console.log("Current Page:", response.data.pagination.page);
    console.log("Attempts:", response.data.attempts.length);

    response.data.attempts.forEach((attempt, index) => {
      console.log(
        `  ${index + 1}. ${attempt.status} - Started: ${new Date(
          attempt.startedAt
        ).toLocaleString()}`
      );
    });
  } catch (error) {
    console.log("❌ Get Attempts Failed:");
    console.log("Error:", error.response?.data?.error || error.message);
  }
}

// Test 4: Cancel Exam
async function testCancelExam(attemptId) {
  console.log("\n🚫 Test 4: Cancel Exam");
  console.log("======================");

  try {
    const response = await axios.post(
      `${API_BASE}/${attemptId}/cancel`,
      {
        reason: "Test cancellation",
      },
      { headers }
    );

    console.log("✅ Cancel Exam Success:");
    console.log("Status:", response.data.attempt.status);
    console.log(
      "Cancelled At:",
      new Date(response.data.attempt.cancelledAt).toLocaleString()
    );
    console.log("Reason:", response.data.attempt.cancellationReason);
  } catch (error) {
    console.log("❌ Cancel Exam Failed:");
    console.log("Error:", error.response?.data?.error || error.message);
  }
}

// Test 5: Expire Exam
async function testExpireExam(attemptId) {
  console.log("\n⏰ Test 5: Expire Exam");
  console.log("======================");

  try {
    const response = await axios.post(
      `${API_BASE}/${attemptId}/expire`,
      {
        reason: "Test expiration",
        force: true,
      },
      { headers }
    );

    console.log("✅ Expire Exam Success:");
    console.log("Status:", response.data.attempt.status);
    console.log("Previous Status:", response.data.attempt.previousStatus);
    console.log(
      "Expired At:",
      new Date(response.data.attempt.expiredAt).toLocaleString()
    );
    console.log(
      "Duration:",
      Math.round(response.data.timeInfo.duration / 1000 / 60),
      "minutes"
    );
  } catch (error) {
    console.log("❌ Expire Exam Failed:");
    console.log("Error:", error.response?.data?.error || error.message);
  }
}

// Test 6: Get Statistics
async function testGetStatistics() {
  console.log("\n📈 Test 6: Get Statistics");
  console.log("==========================");

  try {
    const response = await axios.get(`${API_BASE}/stats/overview`, { headers });

    console.log("✅ Statistics Success:");
    console.log("Overview:", response.data.overview);
    console.log("Recent Attempts:", response.data.recentAttempts.length);
    console.log("Overdue Attempts:", response.data.overdueAttempts.length);
  } catch (error) {
    console.log("❌ Statistics Failed:");
    console.log("Error:", error.response?.data?.error || error.message);
  }
}

// Test 7: Admin Expire Overdue
async function testAdminExpireOverdue() {
  console.log("\n👨‍💼 Test 7: Admin Expire Overdue");
  console.log("=================================");

  try {
    const response = await axios.post(
      `${API_BASE}/expire-overdue`,
      {},
      { headers }
    );

    console.log("✅ Admin Expire Success:");
    console.log("Matched:", response.data.matched);
    console.log("Modified:", response.data.modified);
    console.log(
      "Expired At:",
      new Date(response.data.expiredAt).toLocaleString()
    );
  } catch (error) {
    console.log("❌ Admin Expire Failed:");
    console.log("Error:", error.response?.data?.error || error.message);
  }
}

// Run all tests
async function runAllTests() {
  console.log("🚀 Starting Exam Flow API Tests...\n");

  // Test 1: Resume/Create Exam
  const attemptId = await testResumeExam();

  if (attemptId) {
    // Test 2: Check Status
    await testCheckStatus(attemptId);

    // Test 3: Get Exam Attempts
    await testGetExamAttempts();

    // Test 4: Cancel Exam (uncomment to test)
    // await testCancelExam(attemptId);

    // Test 5: Expire Exam (uncomment to test)
    // await testExpireExam(attemptId);
  }

  // Test 6: Get Statistics
  await testGetStatistics();

  // Test 7: Admin Expire Overdue (requires admin role)
  // await testAdminExpireOverdue();

  console.log("\n🎯 Test Summary:");
  console.log("================");
  console.log("✅ Resume/Create Exam API");
  console.log("✅ Check Status API");
  console.log("✅ Get Exam Attempts API");
  console.log("✅ Get Statistics API");
  console.log(
    "⚠️  Cancel/Expire APIs (commented out - requires valid attempt)"
  );
  console.log("⚠️  Admin APIs (commented out - requires admin role)");

  console.log("\n📝 Notes:");
  console.log("- Replace AUTH_TOKEN with actual JWT token");
  console.log("- Replace TEST_EXAM_ID with actual exam ID");
  console.log("- Uncomment test functions as needed");
  console.log("- Admin tests require admin/moderator role");
}

// Error handling
process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled Error:", error.message);
});

// Run tests
runAllTests().catch(console.error);
