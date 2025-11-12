const nodemailer = require("nodemailer");

// Email configuration from environment variables
const EMAIL_HOST = process.env.EMAIL_HOST || "smtp.gmail.com";
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || "587");
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;

// Create reusable transporter
let transporter = null;

/**
 * Initialize email transporter
 * @returns {Promise<Object>} Nodemailer transporter
 */
function getTransporter() {
  if (transporter) {
    return transporter;
  }

  if (!EMAIL_USER || !EMAIL_PASSWORD) {
    console.warn(
      "Email service not configured. EMAIL_USER and EMAIL_PASSWORD must be set in environment variables."
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_PORT === 465, // true for 465, false for other ports
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASSWORD,
    },
  });

  return transporter;
}

/**
 * Send email
 * @param {string|string[]} to - Recipient email address(es)
 * @param {string} subject - Email subject
 * @param {string} html - HTML email body
 * @param {string} text - Plain text email body (optional)
 * @returns {Promise<Object>} Email sending result
 */
async function sendEmail(to, subject, html, text = null) {
  try {
    const emailTransporter = getTransporter();
    if (!emailTransporter) {
      console.error("Email transporter not available. Email not sent.");
      return {
        success: false,
        error: "Email service not configured",
      };
    }

    const recipients = Array.isArray(to) ? to : [to];

    const mailOptions = {
      from: EMAIL_FROM,
      to: recipients.join(", "),
      subject: subject,
      html: html,
      text: text || html.replace(/<[^>]*>/g, ""), // Strip HTML tags for text version
    };

    const info = await emailTransporter.sendMail(mailOptions);

    console.log("Email sent successfully:", {
      messageId: info.messageId,
      to: recipients,
      subject: subject,
    });

    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
    };
  } catch (error) {
    console.error("Error sending email:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send admin account creation email
 * @param {Object} adminUser - The newly created admin user object
 * @param {string} password - The password (if provided during creation)
 * @param {Object} createdBy - The user who created this admin account
 * @returns {Promise<Object>} Email sending result
 */
async function sendAdminAccountCreatedEmail(adminUser, password = null, createdBy = null) {
  try {
    if (!adminUser.email) {
      console.warn("Cannot send email: Admin user has no email address");
      return {
        success: false,
        error: "Admin user has no email address",
      };
    }

    const adminName = adminUser.name || "Admin";
    const creatorName = createdBy?.name || "System Administrator";
    const loginUrl = process.env.APP_URL || "https://your-app-url.com";

    const subject = `Welcome to Fluento - Admin Account Created`;

    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            background-color: #4CAF50;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .content {
            background-color: #f9f9f9;
            padding: 30px;
            border-radius: 0 0 5px 5px;
          }
          .info-box {
            background-color: white;
            border-left: 4px solid #4CAF50;
            padding: 15px;
            margin: 20px 0;
          }
          .credentials {
            background-color: #fff3cd;
            border: 1px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #4CAF50;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            margin: 20px 0;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            color: #666;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Welcome to Fluento!</h1>
        </div>
        <div class="content">
          <h2>Hello ${adminName},</h2>
          
          <p>Your admin account has been successfully created by <strong>${creatorName}</strong>.</p>
          
          <div class="info-box">
            <h3>Account Details:</h3>
            <ul>
              <li><strong>Name:</strong> ${adminName}</li>
              <li><strong>Email:</strong> ${adminUser.email}</li>
              <li><strong>Role:</strong> Admin</li>
              ${adminUser.phone ? `<li><strong>Phone:</strong> ${adminUser.phone}</li>` : ""}
            </ul>
          </div>
    `;

    if (password) {
      html += `
          <div class="credentials">
            <h3>🔐 Your Login Credentials:</h3>
            <p><strong>Email:</strong> ${adminUser.email}</p>
            <p><strong>Password:</strong> ${password}</p>
            <p style="color: #d32f2f; font-weight: bold;">⚠️ Please change your password after first login for security.</p>
          </div>
      `;
    } else {
      html += `
          <div class="info-box">
            <p><strong>Note:</strong> No password was set during account creation. Please use the password reset feature or contact the administrator to set your password.</p>
          </div>
      `;
    }

    html += `
          <p>You can now access the admin dashboard and manage the Fluento platform.</p>
          
          <div style="text-align: center;">
            <a href="${loginUrl}/login" class="button">Login to Dashboard</a>
          </div>
          
          <div class="info-box">
            <h3>What you can do as an Admin:</h3>
            <ul>
              <li>Manage users (students, tutors, and other admins)</li>
              <li>Create and manage exams</li>
              <li>Create and manage courses</li>
              <li>View analytics and reports</li>
              <li>Configure system settings</li>
            </ul>
          </div>
          
          <p>If you have any questions or need assistance, please contact the system administrator.</p>
          
          <p>Best regards,<br>The Fluento Team</p>
        </div>
        <div class="footer">
          <p>This is an automated email. Please do not reply to this message.</p>
          <p>&copy; ${new Date().getFullYear()} Fluento. All rights reserved.</p>
        </div>
      </body>
      </html>
    `;

    return await sendEmail(adminUser.email, subject, html);
  } catch (error) {
    console.error("Error sending admin account creation email:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  sendEmail,
  sendAdminAccountCreatedEmail,
  getTransporter,
};

