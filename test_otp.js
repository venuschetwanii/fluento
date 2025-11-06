const axios = require("axios");

// Test configuration
const BASE_URL = "http://localhost:3000";
const TEST_PHONE = "9876543210"; // Replace with a valid test phone number

// Helper function to make API calls
async function makeRequest(endpoint, data) {
  try {
    const response = await axios.post(`${BASE_URL}${endpoint}`, data);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message,
    };
  }
}

// Test OTP flow
async function testOTPFlow() {
  console.log("🚀 Testing TextLocal OTP Implementation\n");

  // Step 1: Send OTP
  console.log("1. Sending OTP...");
  const sendOTPResult = await makeRequest("/auth/send-otp", {
    phone: TEST_PHONE,
  });

  if (sendOTPResult.success) {
    console.log("✅ OTP sent successfully:", sendOTPResult.data);
  } else {
    console.log("❌ Failed to send OTP:", sendOTPResult.error);
    return;
  }

  // Step 2: Verify OTP (you'll need to enter the actual OTP received)
  console.log("\n2. Verifying OTP...");
  console.log("Please check your phone for the OTP and enter it below:");

  // In a real test, you would read from stdin or use a test OTP
  // For demonstration, we'll show the expected format
  console.log("Expected request format:");
  console.log(
    JSON.stringify(
      {
        phone: TEST_PHONE,
        otp: "123456", // Replace with actual OTP
        name: "Test User",
        email: "test@example.com",
        role: "student",
      },
      null,
      2
    )
  );

  // Step 3: Test resend OTP
  console.log("\n3. Testing resend OTP...");
  const resendOTPResult = await makeRequest("/auth/resend-otp", {
    phone: TEST_PHONE,
  });

  if (resendOTPResult.success) {
    console.log("✅ OTP resent successfully:", resendOTPResult.data);
  } else {
    console.log("❌ Failed to resend OTP:", resendOTPResult.error);
  }

  // Step 4: Test phone login (after verification)
  console.log("\n4. Testing phone login...");
  console.log("This would require a verified phone number and valid OTP");
  console.log("Expected request format:");
  console.log(
    JSON.stringify(
      {
        phone: TEST_PHONE,
        otp: "123456", // Replace with actual OTP
      },
      null,
      2
    )
  );
}

// Test SMS service directly
async function testSMSService() {
  console.log("\n🔧 Testing SMS Service directly...");

  const {
    validatePhoneNumber,
    generateOTP,
    formatPhoneNumber,
  } = require("./src/services/sms.service");

  // Test phone number validation
  console.log("Testing phone validation:");
  console.log(
    "Valid numbers:",
    ["9876543210", "+919876543210", "919876543210"].map((num) => ({
      number: num,
      valid: validatePhoneNumber(num),
    }))
  );

  console.log(
    "Invalid numbers:",
    ["1234567890", "987654321", "invalid"].map((num) => ({
      number: num,
      valid: validatePhoneNumber(num),
    }))
  );

  // Test OTP generation
  console.log(
    "\nGenerated OTPs:",
    Array.from({ length: 3 }, () => generateOTP())
  );

  // Test phone number formatting
  console.log("\nPhone number formatting:");
  console.log("9876543210 ->", formatPhoneNumber("9876543210"));
  console.log("+919876543210 ->", formatPhoneNumber("+919876543210"));
  console.log("919876543210 ->", formatPhoneNumber("919876543210"));
}

// Run tests
async function runTests() {
  try {
    await testSMSService();
    await testOTPFlow();
  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

// Check if running directly
if (require.main === module) {
  runTests();
}

module.exports = { testOTPFlow, testSMSService };
