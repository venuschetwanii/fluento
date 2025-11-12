const https = require("https");
const querystring = require("querystring");
const dotenv = require("dotenv");
dotenv.config();

// Configuration constants for authkey.io
const AUTH_KEY = process.env.AUTHKEY_API_KEY || "d03e71997580d5fe";
const SENDER_ID =
  process.env.AUTHKEY_SENDER_ID || process.env.AUTHKEY_SID || "28771";
const COMPANY = process.env.AUTHKEY_COMPANY || "Catalysts";

/**
 * Validate phone number format
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} Whether phone number is valid
 */
function validatePhoneNumber(phoneNumber) {
  const cleaned = phoneNumber.replace(/\D/g, "");
  return (
    /^(\+91)?[6-9]\d{9}$/.test(phoneNumber) || /^91[6-9]\d{9}$/.test(cleaned)
  );
}

/**
 * Normalize phone number to a consistent format (10-digit without country code)
 * This ensures "91xxxxxxxxxx" and "xxxxxxxxxx" are treated as the same number
 * @param {string} phoneNumber - Phone number to normalize
 * @returns {string} Normalized phone number (10 digits)
 */
function normalizePhoneNumber(phoneNumber) {
  if (!phoneNumber) return phoneNumber;

  const cleaned = phoneNumber.replace(/\D/g, "");

  // If starts with 91 and is 12 digits, remove country code
  if (cleaned.startsWith("91") && cleaned.length === 12) {
    return cleaned.substring(2); // Return 10-digit number
  }

  // If it's a 10-digit number, return as is
  if (cleaned.length === 10) {
    return cleaned;
  }

  // If it's 11 digits and starts with +91 or 91, try to extract
  if (cleaned.length === 11 && cleaned.startsWith("91")) {
    return cleaned.substring(2);
  }

  // For other cases, return cleaned (but should ideally be 10 digits)
  return cleaned;
}

/**
 * Format phone number for authkey.io API
 * @param {string} phoneNumber - Phone number to format
 * @returns {Object} Object with mobile (without country code) and country_code
 */
function formatPhoneNumber(phoneNumber) {
  const cleaned = phoneNumber.replace(/\D/g, "");

  // If starts with 91, extract country code and mobile
  if (cleaned.startsWith("91") && cleaned.length === 12) {
    return {
      mobile: cleaned.substring(2), // Remove country code
      country_code: "91",
    };
  }

  // If it's a 10-digit number, assume India
  if (cleaned.length === 10) {
    return {
      mobile: cleaned,
      country_code: "91",
    };
  }

  // Default: return as is with country code 91
  return {
    mobile: cleaned,
    country_code: "91",
  };
}

/**
 * Send SMS using authkey.io API
 * @param {string|string[]} numbers - Phone number(s) to send SMS to
 * @param {string} message - Message to send
 * @returns {Promise<Object>} API response
 */
async function sendSMS(numbers, message) {
  try {
    const phoneNumbers = Array.isArray(numbers) ? numbers : [numbers];

    // Validate and format numbers before sending
    const formattedNumbers = phoneNumbers.map((num) => {
      if (!validatePhoneNumber(num)) {
        throw new Error(`Invalid phone number format: ${num}`);
      }
      return formatPhoneNumber(num);
    });

    // Use first number's country code (assuming all numbers are same country)
    const { mobile, country_code } = formattedNumbers[0];
    const mobileNumbers = formattedNumbers.map((f) => f.mobile).join(",");

    // Authkey.io endpoint - using GET with query parameters
    const API_ENDPOINT = process.env.AUTHKEY_API_ENDPOINT || "/request";
    const API_HOSTNAME = process.env.AUTHKEY_API_HOSTNAME || "api.authkey.io";

    // Build query parameters
    const queryParams = {
      authkey: AUTH_KEY,
      mobile: mobileNumbers,
      country_code: country_code,
      sid: SENDER_ID,
      company: COMPANY,
      sms: message, // For regular SMS
    };

    const queryString = querystring.stringify(queryParams);
    const fullPath = `${API_ENDPOINT}?${queryString}`;

    const options = {
      hostname: API_HOSTNAME,
      port: 443,
      path: fullPath,
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      timeout: 30000,
    };

    console.log(
      `Attempting SMS send to: https://${API_HOSTNAME}${fullPath.substring(
        0,
        100
      )}...`
    );
    console.log("Request Data:", {
      authkey: AUTH_KEY ? `${AUTH_KEY.substring(0, 8)}...` : "MISSING",
      mobile: mobileNumbers,
      country_code: country_code,
      sid: SENDER_ID || "NOT SET",
      company: COMPANY,
      sms: message.substring(0, 50) + "...",
    });

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let responseData = "";

        res.on("data", (chunk) => {
          responseData += chunk;
        });

        res.on("end", () => {
          console.log("SMS API Response Status:", res.statusCode);
          console.log(
            "SMS API Response Content-Type:",
            res.headers["content-type"]
          );

          let trimmedResponse = responseData.trim();
          if (trimmedResponse.charCodeAt(0) === 0xfeff) {
            trimmedResponse = trimmedResponse.slice(1);
          }

          const isHtml =
            trimmedResponse.startsWith("<!DOCTYPE") ||
            trimmedResponse.startsWith("<!doctype") ||
            trimmedResponse.startsWith("<HTML") ||
            trimmedResponse.startsWith("<html") ||
            /^\s*<html/i.test(trimmedResponse) ||
            /^\s*<!doctype/i.test(trimmedResponse);

          if (isHtml) {
            console.error("=".repeat(80));
            console.error("SMS API ERROR: Received HTML instead of JSON");
            console.error("Response Status:", res.statusCode);
            console.error(
              "Response Content-Type:",
              res.headers["content-type"]
            );
            console.error("Response Body (first 1000 chars):");
            console.error(trimmedResponse.substring(0, 1000));
            console.error("=".repeat(80));

            return reject(
              new Error(
                `SMS API returned HTML error page instead of JSON. ` +
                  `This usually means the endpoint URL is incorrect or the API key is invalid.\n` +
                  `Status Code: ${res.statusCode}\n` +
                  `Endpoint tried: https://${API_HOSTNAME}${API_ENDPOINT}`
              )
            );
          }

          if (!trimmedResponse || trimmedResponse.length === 0) {
            if (res.statusCode === 200) {
              return resolve({
                status: "success",
                message: "SMS sent successfully",
              });
            } else {
              return reject(
                new Error(
                  `Empty response from SMS API. Status: ${res.statusCode}`
                )
              );
            }
          }

          const contentType = res.headers["content-type"] || "";
          if (
            contentType &&
            !contentType.includes("json") &&
            !contentType.includes("text/plain")
          ) {
            return reject(
              new Error(
                `SMS API returned unexpected content type: ${contentType}.`
              )
            );
          }

          try {
            const result = JSON.parse(trimmedResponse);
            console.log(
              "SMS API Response Body:",
              JSON.stringify(result, null, 2)
            );

            const httpSuccess =
              res.statusCode === 200 || res.statusCode === 201;
            const responseMessage =
              result.Message || result.message || result.msg || "";

            // Check details array for success messages (authkey.io sometimes returns success in details)
            const detailsArray = result.details || result.Details || [];
            const detailsMessage = Array.isArray(detailsArray)
              ? detailsArray.join(" ")
              : String(detailsArray || "");
            const combinedMessage = `${responseMessage} ${detailsMessage}`
              .trim()
              .toLowerCase();

            const hasExplicitError =
              result.error === true ||
              result.status === "error" ||
              result.status === "failed" ||
              (combinedMessage &&
                (combinedMessage.includes("error") ||
                  combinedMessage.includes("failed") ||
                  combinedMessage.includes("connection error")));

            // Success indicators: "sent", "successfully", "submitted successfully", etc.
            const hasSuccessIndicator =
              result.status === "success" ||
              result.success === true ||
              result.error === false ||
              combinedMessage.includes("sent") ||
              combinedMessage.includes("successfully") ||
              combinedMessage.includes("submitted successfully") ||
              combinedMessage.includes("success");

            const isSuccess =
              httpSuccess && !hasExplicitError && hasSuccessIndicator;

            if (isSuccess) {
              resolve({
                status: "success",
                message:
                  responseMessage || detailsMessage || "SMS sent successfully",
                response: result,
              });
            } else {
              resolve({
                status: "error",
                message:
                  responseMessage ||
                  detailsMessage ||
                  result.error ||
                  "Failed to send SMS",
                errors: result.errors ||
                  detailsArray || [
                    responseMessage ||
                      detailsMessage ||
                      result.error ||
                      "Failed to send SMS",
                  ],
              });
            }
          } catch (parseError) {
            return reject(
              new Error(
                `Failed to parse SMS API response as JSON: ${parseError.message}\n` +
                  `Endpoint: https://${API_HOSTNAME}${API_ENDPOINT}\n` +
                  `Status: ${res.statusCode}\n` +
                  `Response preview: ${trimmedResponse.substring(0, 300)}`
              )
            );
          }
        });
      });

      req.on("error", (error) => {
        console.error("SMS API Request Error:", error.message);
        reject(
          new Error(
            `SMS API connection failed: ${error.message}. Check endpoint or API key.`
          )
        );
      });

      req.on("timeout", () => {
        req.destroy();
        reject(
          new Error(
            `SMS API request timed out after 30 seconds. The endpoint might be unreachable.`
          )
        );
      });

      req.end();
    });
  } catch (error) {
    throw new Error(`SMS sending failed: ${error.message}`);
  }
}

/**
 * Send OTP SMS using authkey.io OTP endpoint
 * @param {string} phoneNumber - Phone number to send OTP to
 * @param {string} otpCode - OTP code to send
 * @returns {Promise<Object>} API response
 */
async function sendOTP(phoneNumber, otpCode) {
  try {
    // Validate and format phone number
    if (!validatePhoneNumber(phoneNumber)) {
      throw new Error(`Invalid phone number format: ${phoneNumber}`);
    }

    const { mobile, country_code } = formatPhoneNumber(phoneNumber);

    // Authkey.io endpoint - using GET with query parameters for OTP
    const API_ENDPOINT = process.env.AUTHKEY_API_ENDPOINT || "/request";
    const API_HOSTNAME = process.env.AUTHKEY_API_HOSTNAME || "api.authkey.io";

    // Build query parameters for OTP
    const queryParams = {
      authkey: AUTH_KEY,
      mobile: mobile,
      country_code: country_code,
      sid: SENDER_ID,
      otp: otpCode, // OTP parameter instead of sms
      company: COMPANY,
    };

    const queryString = querystring.stringify(queryParams);
    const fullPath = `${API_ENDPOINT}?${queryString}`;
    const fullUrl = `https://${API_HOSTNAME}${fullPath}`;

    const options = {
      hostname: API_HOSTNAME,
      port: 443,
      path: fullPath,
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      timeout: 30000,
    };

    // Log full URL for debugging (mask sensitive data in logs)
    console.log("=".repeat(80));
    console.log("OTP REQUEST DEBUG:");
    console.log("Full URL:", fullUrl.replace(/authkey=[^&]+/, "authkey=***"));
    console.log("Request Parameters:", {
      authkey: AUTH_KEY ? `${AUTH_KEY.substring(0, 8)}...` : "MISSING",
      mobile: mobile,
      country_code: country_code,
      sid: SENDER_ID || "NOT SET",
      company: COMPANY,
      otp: otpCode,
      original_phone: phoneNumber,
    });
    console.log("=".repeat(80));

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let responseData = "";

        res.on("data", (chunk) => {
          responseData += chunk;
        });

        res.on("end", () => {
          console.log("=".repeat(80));
          console.log("OTP RESPONSE DEBUG:");
          console.log("Response Status:", res.statusCode);
          console.log("Response Content-Type:", res.headers["content-type"]);
          console.log("Raw Response:", responseData);

          let trimmedResponse = responseData.trim();
          if (trimmedResponse.charCodeAt(0) === 0xfeff) {
            trimmedResponse = trimmedResponse.slice(1);
          }

          const isHtml =
            trimmedResponse.startsWith("<!DOCTYPE") ||
            trimmedResponse.startsWith("<!doctype") ||
            trimmedResponse.startsWith("<HTML") ||
            trimmedResponse.startsWith("<html") ||
            /^\s*<html/i.test(trimmedResponse) ||
            /^\s*<!doctype/i.test(trimmedResponse);

          if (isHtml) {
            console.error("=".repeat(80));
            console.error("SMS API ERROR: Received HTML instead of JSON");
            console.error("Response Status:", res.statusCode);
            console.error(
              "Response Content-Type:",
              res.headers["content-type"]
            );
            console.error("Response Body (first 1000 chars):");
            console.error(trimmedResponse.substring(0, 1000));
            console.error("=".repeat(80));

            return reject(
              new Error(
                `SMS API returned HTML error page instead of JSON. ` +
                  `This usually means the endpoint URL is incorrect or the API key is invalid.\n` +
                  `Status Code: ${res.statusCode}\n` +
                  `Endpoint tried: https://${API_HOSTNAME}${API_ENDPOINT}`
              )
            );
          }

          if (!trimmedResponse || trimmedResponse.length === 0) {
            if (res.statusCode === 200) {
              return resolve({
                status: "success",
                message: "OTP sent successfully",
              });
            } else {
              return reject(
                new Error(
                  `Empty response from SMS API. Status: ${res.statusCode}`
                )
              );
            }
          }

          const contentType = res.headers["content-type"] || "";
          if (
            contentType &&
            !contentType.includes("json") &&
            !contentType.includes("text/plain")
          ) {
            return reject(
              new Error(
                `SMS API returned unexpected content type: ${contentType}.`
              )
            );
          }

          try {
            const result = JSON.parse(trimmedResponse);
            console.log(
              "SMS API Response Body:",
              JSON.stringify(result, null, 2)
            );

            const httpSuccess =
              res.statusCode === 200 || res.statusCode === 201;
            const responseMessage =
              result.Message || result.message || result.msg || "";

            // Check details array for success messages (authkey.io sometimes returns success in details)
            const detailsArray = result.details || result.Details || [];
            const detailsMessage = Array.isArray(detailsArray)
              ? detailsArray.join(" ")
              : String(detailsArray || "");
            const combinedMessage = `${responseMessage} ${detailsMessage}`
              .trim()
              .toLowerCase();

            const hasExplicitError =
              result.error === true ||
              result.status === "error" ||
              result.status === "failed" ||
              (combinedMessage &&
                (combinedMessage.includes("error") ||
                  combinedMessage.includes("failed") ||
                  combinedMessage.includes("connection error")));

            // Success indicators: "sent", "successfully", "submitted successfully", etc.
            const hasSuccessIndicator =
              result.status === "success" ||
              result.success === true ||
              result.error === false ||
              combinedMessage.includes("sent") ||
              combinedMessage.includes("successfully") ||
              combinedMessage.includes("submitted successfully") ||
              combinedMessage.includes("success");

            const isSuccess =
              httpSuccess && !hasExplicitError && hasSuccessIndicator;

            console.log("Parsed Response:", JSON.stringify(result, null, 2));
            console.log("Success Detection:", {
              httpSuccess,
              hasExplicitError,
              hasSuccessIndicator,
              isSuccess,
              responseMessage,
              detailsMessage,
              combinedMessage,
            });
            console.log("=".repeat(80));

            if (isSuccess) {
              resolve({
                status: "success",
                message:
                  responseMessage || detailsMessage || "OTP sent successfully",
                response: result,
              });
            } else {
              resolve({
                status: "error",
                message:
                  responseMessage ||
                  detailsMessage ||
                  result.error ||
                  "Failed to send OTP",
                errors: result.errors ||
                  detailsArray || [
                    responseMessage ||
                      detailsMessage ||
                      result.error ||
                      "Failed to send OTP",
                  ],
              });
            }
          } catch (parseError) {
            return reject(
              new Error(
                `Failed to parse SMS API response as JSON: ${parseError.message}\n` +
                  `Endpoint: https://${API_HOSTNAME}${API_ENDPOINT}\n` +
                  `Status: ${res.statusCode}\n` +
                  `Response preview: ${trimmedResponse.substring(0, 300)}`
              )
            );
          }
        });
      });

      req.on("error", (error) => {
        console.error("SMS API Request Error:", error.message);
        reject(
          new Error(
            `SMS API connection failed: ${error.message}. Check endpoint or API key.`
          )
        );
      });

      req.on("timeout", () => {
        req.destroy();
        reject(
          new Error(
            `SMS API request timed out after 30 seconds. The endpoint might be unreachable.`
          )
        );
      });

      req.end();
    });
  } catch (error) {
    throw new Error(`OTP sending failed: ${error.message}`);
  }
}

/**
 * Generate a random 6-digit OTP
 * @returns {string} 6-digit OTP code
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Export all functions
module.exports = {
  sendSMS,
  sendOTP,
  generateOTP,
  validatePhoneNumber,
  formatPhoneNumber,
  normalizePhoneNumber,
};
