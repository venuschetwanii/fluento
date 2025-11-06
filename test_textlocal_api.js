const https = require("https");
const querystring = require("querystring");

// Test TextLocal API credentials
async function testTextLocalAPI() {
  console.log("🔍 Testing TextLocal API Credentials...\n");

  // Get credentials
  const apiKey =
    process.env.TEXTLOCAL_API_KEY ||
    "NDk1OTU3MzE1MDQ0NGY2ZTc2NTc2MjUwNTI0MTVhNmQ=";
  const senderId = process.env.TEXTLOCAL_SENDER_ID || "TXTLCL";

  console.log("API Key:", apiKey);
  console.log("API Key Length:", apiKey.length);
  console.log("Sender ID:", senderId);
  console.log("");

  // Test data
  const testData = {
    apikey: apiKey,
    numbers: "919876543210", // Test number
    sender: senderId,
    message: "Test message from Fluento OTP system",
  };

  const postData = querystring.stringify(testData);

  const options = {
    hostname: "api.textlocal.in",
    port: 443,
    path: "/send/",
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(postData),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        try {
          const result = JSON.parse(responseData);
          console.log("📡 API Response:");
          console.log(JSON.stringify(result, null, 2));

          if (result.status === "success") {
            console.log("✅ API credentials are working!");
          } else {
            console.log("❌ API Error:", result.errors || result.message);
            console.log("\n🔧 Troubleshooting Steps:");
            console.log("1. Check if your API key is correct");
            console.log(
              "2. Verify the sender ID is approved in your TextLocal account"
            );
            console.log(
              "3. Ensure your TextLocal account has sufficient balance"
            );
            console.log("4. Check if the sender ID is active");
          }

          resolve(result);
        } catch (error) {
          console.error("❌ Failed to parse response:", error.message);
          reject(error);
        }
      });
    });

    req.on("error", (error) => {
      console.error("❌ Request failed:", error.message);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Test balance endpoint
async function testBalance() {
  console.log("\n💰 Testing TextLocal Balance...\n");

  const apiKey =
    process.env.TEXTLOCAL_API_KEY ||
    "NDk1OTU3MzE1MDQ0NGY2ZTc2NTc2MjUwNTI0MTVhNmQ=";

  const testData = {
    apikey: apiKey,
  };

  const postData = querystring.stringify(testData);

  const options = {
    hostname: "api.textlocal.in",
    port: 443,
    path: "/balance/",
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(postData),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        try {
          const result = JSON.parse(responseData);
          console.log("💰 Balance Response:");
          console.log(JSON.stringify(result, null, 2));
          resolve(result);
        } catch (error) {
          console.error("❌ Failed to parse balance response:", error.message);
          reject(error);
        }
      });
    });

    req.on("error", (error) => {
      console.error("❌ Balance request failed:", error.message);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Run tests
async function runTests() {
  try {
    await testTextLocalAPI();
    await testBalance();
  } catch (error) {
    console.error("Test failed:", error.message);
  }
}

// Check if running directly
if (require.main === module) {
  runTests();
}

module.exports = { testTextLocalAPI, testBalance };
