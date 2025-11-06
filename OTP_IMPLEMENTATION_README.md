# TextLocal OTP Implementation

This implementation adds SMS-based OTP authentication to the Fluento backend using TextLocal API.

## Features

- ✅ SMS OTP sending via TextLocal API
- ✅ Phone number validation and formatting
- ✅ OTP expiration (5 minutes)
- ✅ Rate limiting (max 3 attempts, 1 minute cooldown)
- ✅ User registration and login via phone number
- ✅ JWT token generation after successful verification

## Environment Variables

Add these to your `.env` file:

```env
# TextLocal SMS API
TEXTLOCAL_API_KEY=NDk1OTU3MzE1MDQ0NGY2ZTc2NTc2MjUwNTI0MTVhNmQ=
TEXTLOCAL_SENDER_ID=TXTLCL
```

## API Endpoints

### 1. Send OTP

**POST** `/auth/send-otp`

Send OTP to a phone number for registration or login.

**Request Body:**

```json
{
  "phone": "9876543210"
}
```

**Response:**

```json
{
  "message": "OTP sent successfully",
  "phone": "9876543210",
  "expiresIn": 300
}
```

### 2. Verify OTP

**POST** `/auth/verify-otp`

Verify OTP and complete registration or login.

**Request Body:**

```json
{
  "phone": "9876543210",
  "otp": "123456",
  "name": "John Doe",
  "email": "john@example.com",
  "role": "student"
}
```

**Response:**

```json
{
  "message": "Phone number verified successfully",
  "accessToken": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "64f8b1234567890abcdef123",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "9876543210",
    "role": "student",
    "isPhoneVerified": true
  }
}
```

### 3. Resend OTP

**POST** `/auth/resend-otp`

Resend OTP to the same phone number.

**Request Body:**

```json
{
  "phone": "9876543210"
}
```

**Response:**

```json
{
  "message": "OTP resent successfully",
  "phone": "9876543210",
  "expiresIn": 300
}
```

### 4. Login with Phone

**POST** `/auth/login-phone`

Login using phone number and OTP (for already verified users).

**Request Body:**

```json
{
  "phone": "9876543210",
  "otp": "123456"
}
```

**Response:**

```json
{
  "message": "Login successful",
  "accessToken": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "64f8b1234567890abcdef123",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "9876543210",
    "role": "student",
    "isPhoneVerified": true
  }
}
```

## Database Schema Updates

The User model has been updated with the following fields:

```javascript
{
  phone: { type: String, unique: true, index: true, sparse: true },
  otp: {
    code: String,
    expiresAt: Date,
    attempts: { type: Number, default: 0 }
  },
  isPhoneVerified: { type: Boolean, default: false }
}
```

## SMS Service

The `SMSService` class handles all SMS-related operations:

- **sendSMS(numbers, message)**: Send SMS to phone number(s)
- **sendOTP(phoneNumber, otpCode)**: Send OTP SMS with formatted message
- **generateOTP()**: Generate 6-digit random OTP
- **validatePhoneNumber(phoneNumber)**: Validate Indian mobile number format
- **formatPhoneNumber(phoneNumber)**: Format phone number for TextLocal API

## Security Features

1. **OTP Expiration**: OTPs expire after 5 minutes
2. **Rate Limiting**: Maximum 3 attempts per OTP, 1-minute cooldown between requests
3. **Phone Validation**: Validates Indian mobile number format
4. **Secure Storage**: OTP codes are stored temporarily and cleared after verification
5. **JWT Tokens**: Secure authentication tokens with 7-day expiration

## Testing

Run the test script to verify the implementation:

```bash
node test_otp.js
```

## Usage Examples

### Frontend Integration

```javascript
// Send OTP
const sendOTP = async (phone) => {
  const response = await fetch("/auth/send-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  return response.json();
};

// Verify OTP
const verifyOTP = async (phone, otp, userData) => {
  const response = await fetch("/auth/verify-otp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, otp, ...userData }),
  });
  return response.json();
};

// Login with phone
const loginWithPhone = async (phone, otp) => {
  const response = await fetch("/auth/login-phone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, otp }),
  });
  return response.json();
};
```

## Error Handling

The API returns appropriate HTTP status codes and error messages:

- `400`: Bad Request (invalid phone number, missing fields)
- `404`: Not Found (no user/OTP found)
- `429`: Too Many Requests (rate limiting)
- `500`: Internal Server Error (SMS sending failed)

## Notes

- Phone numbers are automatically formatted with +91 country code
- OTP codes are 6-digit random numbers
- SMS messages are sent with sender ID "TXTLCL"
- The implementation supports both new user registration and existing user login
- All OTP-related data is cleared after successful verification
