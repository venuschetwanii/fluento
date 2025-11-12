# Gmail Configuration Guide for Nodemailer

This guide will walk you through setting up Gmail to send emails using nodemailer in your application.

## Prerequisites

- A Gmail account
- Access to your Google Account settings
- Your application's `.env` file

## Step-by-Step Setup

### Step 1: Enable 2-Step Verification

Gmail requires 2-Step Verification to be enabled before you can generate an App Password.

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Under "Signing in to Google", find **2-Step Verification**
3. Click on it and follow the prompts to enable it
4. You'll need to verify your phone number and/or email

### Step 2: Generate an App Password

Once 2-Step Verification is enabled:

1. Go back to [Google Account Security](https://myaccount.google.com/security)
2. Under "Signing in to Google", find **App passwords** (this option only appears after 2-Step Verification is enabled)
3. Click on **App passwords**
4. You may be asked to sign in again
5. Select **Mail** as the app type
6. Select **Other (Custom name)** as the device type
7. Enter a name like "Fluento Backend" or "Node.js App"
8. Click **Generate**
9. **Copy the 16-character password** that appears (you won't be able to see it again!)

The password will look like: `abcd efgh ijkl mnop` (with spaces, but you can use it with or without spaces)

### Step 3: Configure Your .env File

Add the following to your `.env` file in the root directory:

```env
# Gmail SMTP Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=abcdefghijklmnop
EMAIL_FROM=your-email@gmail.com
APP_URL=https://your-app-url.com
```

**Important Notes:**

- `EMAIL_USER`: Your full Gmail address (e.g., `john.doe@gmail.com`)
- `EMAIL_PASSWORD`: The 16-character App Password you generated (you can use it with or without spaces)
- `EMAIL_FROM`: Usually the same as `EMAIL_USER`
- `EMAIL_PORT`: Use `587` for TLS (recommended) or `465` for SSL

### Step 4: Test Your Configuration

You can test if your email configuration works by creating a test script or by creating an admin account (which will trigger an email).

#### Option A: Create a Test Script

Create a file `test-email.js` in your root directory:

```javascript
require("dotenv").config();
const { sendEmail } = require("./src/services/email.service");

async function testEmail() {
  const result = await sendEmail(
    "recipient@example.com", // Replace with your email
    "Test Email from Fluento",
    "<h1>Test Email</h1><p>If you receive this, your email configuration is working!</p>"
  );

  console.log("Email result:", result);
}

testEmail().catch(console.error);
```

Run it with:

```bash
node test-email.js
```

#### Option B: Create an Admin Account

Use the API to create an admin account, which will automatically send a welcome email:

```bash
POST /users
Authorization: Bearer <your-admin-token>
Content-Type: application/json

{
  "name": "Test Admin",
  "email": "test-admin@example.com",
  "role": "admin",
  "password": "testpassword123"
}
```

## Gmail SMTP Settings Summary

| Setting            | Value                                    |
| ------------------ | ---------------------------------------- |
| **Host**           | `smtp.gmail.com`                         |
| **Port (TLS)**     | `587` (recommended)                      |
| **Port (SSL)**     | `465`                                    |
| **Security**       | TLS (for port 587) or SSL (for port 465) |
| **Authentication** | Required (use App Password)              |
| **Username**       | Your full Gmail address                  |
| **Password**       | 16-character App Password                |

## Troubleshooting

### Error: "Invalid login credentials"

**Solution:**

- Make sure you're using the **App Password**, not your regular Gmail password
- Verify the App Password is correct (no extra spaces)
- Ensure 2-Step Verification is enabled

### Error: "Less secure app access" or "Access blocked"

**Solution:**

- This error means you're trying to use your regular password
- You **must** use an App Password when 2-Step Verification is enabled
- Generate a new App Password and use that instead

### Error: "Connection timeout" or "ECONNREFUSED"

**Solution:**

- Check your firewall settings
- Verify `EMAIL_HOST` is `smtp.gmail.com`
- Try using port `465` with SSL instead of `587` with TLS
- Check if your network blocks SMTP ports

### Error: "Message failed: 550-5.7.1"

**Solution:**

- Gmail may be blocking the email due to spam filters
- Make sure the recipient email is valid
- Check Gmail's sending limits (500 emails per day for free accounts)
- Verify your account isn't flagged for suspicious activity

### Email not sending but no error

**Solution:**

- Check your application logs for warnings
- Verify all environment variables are set correctly
- Make sure `EMAIL_USER` and `EMAIL_PASSWORD` are in your `.env` file
- Restart your application after changing `.env` values

## Alternative: Using OAuth2 (Advanced)

For production applications, you might want to use OAuth2 instead of App Passwords. This is more secure but requires additional setup:

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Gmail API
3. Create OAuth2 credentials
4. Configure nodemailer with OAuth2 tokens

For most use cases, App Passwords are sufficient and easier to set up.

## Gmail Sending Limits

Be aware of Gmail's sending limits:

- **Free Gmail accounts**: 500 emails per day
- **Google Workspace**: 2,000 emails per day (varies by plan)

If you need to send more emails, consider:

- Using a dedicated email service (SendGrid, Mailgun, AWS SES, etc.)
- Upgrading to Google Workspace
- Using multiple Gmail accounts with load balancing

## Security Best Practices

1. **Never commit your `.env` file** to version control
2. **Use App Passwords** instead of your main Gmail password
3. **Rotate App Passwords** periodically (delete old ones, create new ones)
4. **Monitor your Gmail account** for suspicious activity
5. **Use environment-specific credentials** (different passwords for dev/staging/production)

## Example .env Configuration

```env
# Development
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=dev-account@gmail.com
EMAIL_PASSWORD=abcd efgh ijkl mnop
EMAIL_FROM=dev-account@gmail.com
APP_URL=http://localhost:3000

# Production
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=production-account@gmail.com
EMAIL_PASSWORD=wxyz abcd efgh ijkl
EMAIL_FROM=production-account@gmail.com
APP_URL=https://your-production-domain.com
```

## Need Help?

If you're still having issues:

1. Check the application logs for detailed error messages
2. Verify all environment variables are loaded correctly
3. Test with a simple email first before using the admin creation feature
4. Check Gmail's security settings and recent activity
