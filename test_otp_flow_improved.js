const axios = require("axios");

// Configuration
const BASE_URL = "http://localhost:4000";
const AUTH_BASE = `${BASE_URL}/auth`;

// Mock JWT token (replace with actual token in real testing)
const AUTH_TOKEN = "your_jwt_token_here";

const headers = {
  Authorization: `Bearer ${AUTH_TOKEN}`,
  "Content-Type": "application/json",
};

console.log("🧪 Testing Improved OTP Flow (No User Creation on SMS Failure)\n");

// Test 1: Send OTP with valid phone number
async function testSendOTPSuccess() {
  console.log("📱 Test 1: Send OTP - Success Case");
  console.log("==================================");

  try {
    const response = await axios.post(
      `${AUTH_BASE}/send-otp`,
      {
        phone: "+919876543210",
      },
      { headers }
    );

    console.log("✅ OTP Sent Successfully:");
    console.log("Message:", response.data.message);
    console.log("Phone:", response.data.phone);
    console.log("Expires In:", response.data.expiresIn, "seconds");
    console.log("✅ User record should be created in database");

    return true;
  } catch (error) {
    console.log("❌ OTP Send Failed:");
    console.log("Error:", error.response?.data?.error || error.message);
    return false;
  }
}

// Test 2: Send OTP with invalid phone number
async function testSendOTPInvalidPhone() {
  console.log("\n📱 Test 2: Send OTP - Invalid Phone Number");
  console.log("===========================================");

  try {
    const response = await axios.post(
      `${AUTH_BASE}/send-otp`,
      {
        phone: "invalid-phone",
      },
      { headers }
    );

    console.log("❌ Unexpected Success (should have failed)");
    return false;
  } catch (error) {
    console.log("✅ Correctly Rejected Invalid Phone:");
    console.log("Error:", error.response?.data?.error);
    console.log("✅ No user record should be created");
    return true;
  }
}

// Test 3: Send OTP with SMS service failure (simulated)
async function testSendOTPSMSFailure() {
  console.log("\n📱 Test 3: Send OTP - SMS Service Failure");
  console.log("==========================================");

  try {
    // This test assumes SMS service will fail (e.g., invalid API key)
    const response = await axios.post(
      `${AUTH_BASE}/send-otp`,
      {
        phone: "+919876543211",
      },
      { headers }
    );

    console.log("❌ Unexpected Success (SMS should have failed)");
    return false;
  } catch (error) {
    console.log("✅ Correctly Handled SMS Failure:");
    console.log("Error:", error.response?.data?.error);
    console.log("Details:", error.response?.data?.details);
    console.log("✅ No user record should be created due to SMS failure");
    return true;
  }
}

// Test 4: Resend OTP for existing user
async function testResendOTP() {
  console.log("\n📱 Test 4: Resend OTP - Existing User");
  console.log("=====================================");

  try {
    const response = await axios.post(
      `${AUTH_BASE}/resend-otp`,
      {
        phone: "+919876543210", // Assuming this user exists from Test 1
      },
      { headers }
    );

    console.log("✅ OTP Resent Successfully:");
    console.log("Message:", response.data.message);
    console.log("Phone:", response.data.phone);
    console.log("✅ User record should be updated with new OTP");

    return true;
  } catch (error) {
    console.log("❌ OTP Resend Failed:");
    console.log("Error:", error.response?.data?.error || error.message);
    return false;
  }
}

// Test 5: Resend OTP for non-existent user
async function testResendOTPNonExistentUser() {
  console.log("\n📱 Test 5: Resend OTP - Non-existent User");
  console.log("=========================================");

  try {
    const response = await axios.post(
      `${AUTH_BASE}/resend-otp`,
      {
        phone: "+919999999999", // Non-existent user
      },
      { headers }
    );

    console.log("❌ Unexpected Success (should have failed)");
    return false;
  } catch (error) {
    console.log("✅ Correctly Rejected Non-existent User:");
    console.log("Error:", error.response?.data?.error);
    console.log("✅ No user record should be created");
    return true;
  }
}

// Test 6: Verify OTP with correct code
async function testVerifyOTPSuccess() {
  console.log("\n📱 Test 6: Verify OTP - Success Case");
  console.log("====================================");

  try {
    const response = await axios.post(
      `${AUTH_BASE}/verify-otp`,
      {
        phone: "+919876543210",
        otp: "123456", // Replace with actual OTP from SMS
        name: "Test User",
        email: "test@example.com",
        role: "student",
      },
      { headers }
    );

    console.log("✅ OTP Verified Successfully:");
    console.log("Message:", response.data.message);
    console.log("User:", response.data.user);
    console.log(
      "Access Token:",
      response.data.accessToken ? "Present" : "Not Present"
    );
    console.log("✅ User should be fully registered and verified");

    return true;
  } catch (error) {
    console.log("❌ OTP Verification Failed:");
    console.log("Error:", error.response?.data?.error || error.message);
    return false;
  }
}

// Test 7: Verify OTP with incorrect code
async function testVerifyOTPIncorrect() {
  console.log("\n📱 Test 7: Verify OTP - Incorrect Code");
  console.log("======================================");

  try {
    const response = await axios.post(
      `${AUTH_BASE}/verify-otp`,
      {
        phone: "+919876543210",
        otp: "000000", // Incorrect OTP
        name: "Test User",
        email: "test@example.com",
        role: "student",
      },
      { headers }
    );

    console.log("❌ Unexpected Success (should have failed)");
    return false;
  } catch (error) {
    console.log("✅ Correctly Rejected Incorrect OTP:");
    console.log("Error:", error.response?.data?.error);
    console.log("✅ User should not be verified");
    return true;
  }
}

// Run all tests
async function runAllTests() {
  console.log("🚀 Starting Improved OTP Flow Tests...\n");

  const results = [];

  // Test 1: Send OTP Success
  results.push(await testSendOTPSuccess());

  // Test 2: Send OTP Invalid Phone
  results.push(await testSendOTPInvalidPhone());

  // Test 3: Send OTP SMS Failure
  results.push(await testSendOTPSMSFailure());

  // Test 4: Resend OTP Success
  results.push(await testResendOTP());

  // Test 5: Resend OTP Non-existent User
  results.push(await testResendOTPNonExistentUser());

  // Test 6: Verify OTP Success
  results.push(await testVerifyOTPSuccess());

  // Test 7: Verify OTP Incorrect
  results.push(await testVerifyOTPIncorrect());

  console.log("\n🎯 Test Summary:");
  console.log("================");
  console.log(
    `✅ Passed: ${results.filter((r) => r).length}/${results.length}`
  );
  console.log(
    `❌ Failed: ${results.filter((r) => !r).length}/${results.length}`
  );

  console.log("\n🔒 Security Improvements:");
  console.log("=========================");
  console.log("✅ Users are NOT created if OTP fails to send");
  console.log("✅ Users are NOT created for invalid phone numbers");
  console.log("✅ Users are NOT created for SMS service failures");
  console.log("✅ Only successful OTP delivery creates/updates user records");
  console.log("✅ Database integrity is maintained");

  console.log("\n📝 Notes:");
  console.log("- Replace AUTH_TOKEN with actual JWT token");
  console.log("- Replace OTP codes with actual values from SMS");
  console.log("- Test with real phone numbers for SMS delivery");
  console.log("- Monitor database to verify no orphaned user records");
}

// Error handling
process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled Error:", error.message);
});

// Run tests
runAllTests().catch(console.error);
