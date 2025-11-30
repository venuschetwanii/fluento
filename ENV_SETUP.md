# Environment Variables Setup

## Required Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# MongoDB Connection
MONGO_URI=your_mongodb_connection_string

# JWT Secret for authentication tokens
JWT_SECRET=your_jwt_secret_key

# Authkey.io API Key for OTP Service (REQUIRED)
AUTHKEY_API_KEY=your_authkey_api_key

# Optional: Override API endpoint if the default doesn't work
# AUTHKEY_API_ENDPOINT=/api/send
# AUTHKEY_API_HOSTNAME=authkey.io

# AWS Configuration (if using S3 or other AWS services)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=your_aws_region
AWS_S3_BUCKET=your_s3_bucket_name

# OpenAI API Key (if using for grading services)
OPENAI_API_KEY=your_openai_api_key

# Email Configuration (for sending admin account creation emails)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
EMAIL_FROM=your_email@gmail.com
APP_URL=https://your-app-url.com
```

## Important Notes

1. **AUTHKEY_API_KEY**: **REQUIRED** - You must set this in your `.env` file. Get your API key from your authkey.io dashboard.
2. Make sure `.env` is in your `.gitignore` file (it already is) to keep your secrets safe.
3. Never commit your `.env` file to version control.

## OTP Service Configuration

The application now uses **authkey.io** for sending OTP SMS messages. The service is configured in `src/services/sms.service.js`.

### API Endpoint

The API endpoint used is: `https://api.authkey.io/request`

**Note:** This is the correct endpoint according to authkey.io API documentation.

### Required Environment Variables

```env
# Authkey.io API Key (REQUIRED)
AUTHKEY_API_KEY=your_authkey_api_key
```

### Parameters

- `authkey`: Your authkey API key (from AUTHKEY_API_KEY env variable)
- `mobile`: Phone number (with country code, e.g., 91XXXXXXXXXX)
- `sms`: SMS message content (note: authkey.io uses `sms` parameter, not `message`)
- `sender`: Sender ID (optional, can be set via AUTHKEY_SENDER_ID env variable)
- `pe_id`: Principal Entity ID (optional, for registered templates)
- `template_id`: Template ID (optional, for registered templates)

### Optional Environment Variables

```env
# Override API endpoint if needed
AUTHKEY_API_ENDPOINT=/request
AUTHKEY_API_HOSTNAME=api.authkey.io

# Sender ID (if required by your account)
AUTHKEY_SENDER_ID=YOUR_SENDER_ID

# For template-based messages (optional)
AUTHKEY_PE_ID=your_pe_id
AUTHKEY_TEMPLATE_ID=your_template_id
```

### Troubleshooting

If you get HTML errors:

1. Check your authkey.io dashboard for the correct API endpoint
2. Verify your API key is correct
3. Check if the endpoint requires a different format (some APIs use GET instead of POST)
4. Verify the required parameters match your authkey.io account settings

Common alternative endpoints:

- `https://api.authkey.io/send`
- `https://authkey.io/send`
- `https://www.authkey.io/api/send`

Update the endpoint in `src/services/sms.service.js` if needed.

## Email Service Configuration

The application uses **nodemailer** for sending emails. When an admin account is created, a welcome email is automatically sent to the new admin.

### Gmail Setup

If using Gmail, you need to:
1. Enable 2-Step Verification on your Google account
2. Generate an App Password:
   - Go to Google Account → Security → 2-Step Verification → App passwords
   - Generate a new app password for "Mail"
   - Use this app password as `EMAIL_PASSWORD` (not your regular Gmail password)

### Email Environment Variables

- `EMAIL_HOST`: SMTP server hostname (default: `smtp.gmail.com`)
- `EMAIL_PORT`: SMTP port (default: `587` for TLS, use `465` for SSL)
- `EMAIL_USER`: Your email address
- `EMAIL_PASSWORD`: Your email password or app password
- `EMAIL_FROM`: Sender email address (defaults to `EMAIL_USER`)
- `APP_URL`: Your application URL for login links in emails

### Other Email Providers

For other email providers (Outlook, Yahoo, etc.), update `EMAIL_HOST` and `EMAIL_PORT` accordingly:
- **Outlook/Hotmail**: `smtp-mail.outlook.com`, port `587`
- **Yahoo**: `smtp.mail.yahoo.com`, port `587` or `465`
- **Custom SMTP**: Use your provider's SMTP settings
