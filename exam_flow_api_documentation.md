# Exam Flow API Documentation

## Overview

This document describes the comprehensive exam flow APIs for resume, expire, and status management functionality.

## Base URL

```
http://localhost:4000/attempts
```

## Authentication

All endpoints require JWT authentication via `Authorization: Bearer <token>` header.

---

## 1. Resume Exam Flow

### POST `/resume`

Resume or create an in-progress attempt for an exam.

**Request Body:**

```json
{
  "examId": "string (required)",
  "forceNew": "boolean (optional, default: false)"
}
```

**Response (200):**

```json
{
  "attempt": {
    "_id": "attempt_id",
    "userId": "user_id",
    "examId": "exam_id",
    "attemptType": "full_exam",
    "status": "in_progress",
    "startedAt": "2025-01-12T10:00:00.000Z",
    "expiresAt": "2025-01-12T13:00:00.000Z",
    "submittedAt": null,
    "sectionsStatus": [
      {
        "sectionId": "section_id",
        "status": "in_progress"
      }
    ],
    "responses": 0,
    "scoring": null
  },
  "exam": {
    "_id": "exam_id",
    "title": "IELTS Academic Test",
    "type": "IELTS_AC",
    "duration": 180,
    "sections": 4
  },
  "timeInfo": {
    "remainingMs": 10800000,
    "isExpired": false,
    "totalDuration": 10800000
  },
  "previousAttempts": {
    "total": 2,
    "expired": 1,
    "submitted": 1,
    "graded": 0
  }
}
```

**Features:**

- ✅ Auto-detects existing in-progress attempts
- ✅ Auto-expires overdue attempts
- ✅ Validates exam availability
- ✅ Provides comprehensive time information
- ✅ Shows previous attempt history

---

## 2. Expire Exam Flow

### POST `/:id/expire`

Manually expire a specific attempt.

**Request Body:**

```json
{
  "reason": "string (optional)",
  "force": "boolean (optional, default: false)"
}
```

**Response (200):**

```json
{
  "attempt": {
    "_id": "attempt_id",
    "userId": "user_id",
    "examId": "exam_id",
    "status": "expired",
    "previousStatus": "in_progress",
    "startedAt": "2025-01-12T10:00:00.000Z",
    "expiredAt": "2025-01-12T11:30:00.000Z",
    "expirationReason": "Manual expiration by user",
    "expiredBy": "user_id"
  },
  "timeInfo": {
    "duration": 5400000,
    "wasOverdue": false
  }
}
```

**Features:**

- ✅ Owner or admin/moderator can expire
- ✅ Tracks expiration reason and who expired it
- ✅ Validates attempt can be expired
- ✅ Provides duration information

### POST `/expire-overdue`

Admin-only: Expire all overdue in-progress attempts.

**Response (200):**

```json
{
  "matched": 5,
  "modified": 3,
  "expiredAt": "2025-01-12T11:30:00.000Z"
}
```

---

## 3. Exam Status Management

### GET `/:id/status`

Get exam status and time remaining for a specific attempt.

**Response (200):**

```json
{
  "attempt": {
    "_id": "attempt_id",
    "status": "in_progress",
    "startedAt": "2025-01-12T10:00:00.000Z",
    "expiresAt": "2025-01-12T13:00:00.000Z",
    "submittedAt": null,
    "expiredAt": null
  },
  "timeInfo": {
    "remainingMs": 7200000,
    "isExpired": false,
    "timeStatus": "normal",
    "totalDuration": 10800000,
    "elapsed": 3600000
  },
  "progress": {
    "sectionsTotal": 4,
    "sectionsCompleted": 1,
    "responsesCount": 15
  }
}
```

**Time Status Levels:**

- `normal`: More than 15 minutes remaining
- `warning`: 5-15 minutes remaining
- `critical`: Less than 5 minutes remaining
- `expired`: Time has run out

### GET `/exam/:examId`

Get all attempts for a specific exam by user.

**Query Parameters:**

- `status` (optional): Filter by status
- `limit` (optional, default: 10): Number of results per page
- `page` (optional, default: 1): Page number

**Response (200):**

```json
{
  "attempts": [
    {
      "_id": "attempt_id",
      "status": "submitted",
      "startedAt": "2025-01-12T10:00:00.000Z",
      "submittedAt": "2025-01-12T13:00:00.000Z",
      "scoring": {
        "score": 25,
        "maxScore": 40,
        "accuracy": 0.625,
        "scaled": {
          "type": "IELTS",
          "score": 6.5,
          "sectionScores": {
            "Listening": 7,
            "Reading": 6.5,
            "Writing": 6,
            "Speaking": 6.5
          }
        }
      }
    }
  ],
  "exam": {
    "_id": "exam_id",
    "title": "IELTS Academic Test",
    "type": "IELTS_AC",
    "duration": 180
  },
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 3,
    "pages": 1
  }
}
```

---

## 4. Cancel Exam Flow

### POST `/:id/cancel`

Cancel an in-progress attempt.

**Request Body:**

```json
{
  "reason": "string (optional)"
}
```

**Response (200):**

```json
{
  "attempt": {
    "_id": "attempt_id",
    "status": "cancelled",
    "cancelledAt": "2025-01-12T11:30:00.000Z",
    "cancellationReason": "User requested cancellation"
  },
  "message": "Attempt cancelled successfully"
}
```

---

## 5. Statistics and Overview

### GET `/stats/overview`

Get exam flow statistics for a user.

**Response (200):**

```json
{
  "overview": {
    "total": 15,
    "inProgress": 2,
    "submitted": 8,
    "graded": 5,
    "expired": 3,
    "overdue": 1
  },
  "recentAttempts": [
    {
      "_id": "attempt_id",
      "examId": {
        "_id": "exam_id",
        "title": "IELTS Academic Test",
        "type": "IELTS_AC"
      },
      "status": "submitted",
      "startedAt": "2025-01-12T10:00:00.000Z",
      "submittedAt": "2025-01-12T13:00:00.000Z",
      "createdAt": "2025-01-12T10:00:00.000Z"
    }
  ],
  "overdueAttempts": [
    {
      "_id": "attempt_id",
      "examId": "exam_id",
      "startedAt": "2025-01-12T08:00:00.000Z",
      "expiresAt": "2025-01-12T11:00:00.000Z",
      "overdueBy": 1800000
    }
  ]
}
```

---

## 6. Automatic Expiration

### Cron Job

The system automatically expires overdue attempts every minute via a cron job:

```javascript
// Every minute: expire overdue attempts
cron.schedule("* * * * *", async () => {
  const now = new Date();
  const result = await AttemptModel.updateMany(
    { status: "in_progress", expiresAt: { $lt: now } },
    { $set: { status: "expired", expiredAt: now } }
  );
});
```

---

## 7. Error Responses

### Common Error Codes

**400 Bad Request:**

```json
{
  "error": "examId is required"
}
```

**403 Forbidden:**

```json
{
  "error": "Forbidden"
}
```

**404 Not Found:**

```json
{
  "error": "Attempt not found"
}
```

**409 Conflict:**

```json
{
  "error": "An in-progress attempt already exists for this exam"
}
```

---

## 8. Status Flow Diagram

```
[Not Started] → [In Progress] → [Submitted] → [Graded]
                    ↓              ↓
                [Expired]      [Cancelled]
                    ↓
                [Expired]
```

**Status Transitions:**

- `in_progress` → `submitted` (via submit endpoint)
- `in_progress` → `expired` (via time expiration or manual expire)
- `in_progress` → `cancelled` (via cancel endpoint)
- `submitted` → `graded` (via grading process)

---

## 9. Usage Examples

### Start/Resume an Exam

```bash
curl -X POST http://localhost:4000/attempts/resume \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"examId": "exam_id_here"}'
```

### Check Exam Status

```bash
curl -X GET http://localhost:4000/attempts/attempt_id/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Cancel an Exam

```bash
curl -X POST http://localhost:4000/attempts/attempt_id/cancel \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Technical issues"}'
```

### Get Exam Statistics

```bash
curl -X GET http://localhost:4000/attempts/stats/overview \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## 10. Database Schema Updates

### New Fields Added to Attempt Model:

```javascript
{
  expiredAt: Date,
  expirationReason: String,
  expiredBy: { type: Schema.Types.ObjectId, ref: "User" },
  cancelledAt: Date,
  cancellationReason: String
}
```

### Indexes Added:

```javascript
{
  status: {
    index: true;
  }
}
```

---

## 11. Security Features

- ✅ JWT authentication required for all endpoints
- ✅ User can only access their own attempts
- ✅ Admin/moderator can expire any attempt
- ✅ Proper validation of attempt states
- ✅ Automatic cleanup of overdue attempts

---

## 12. Performance Considerations

- ✅ Pagination for large result sets
- ✅ Selective field projection for list views
- ✅ Indexed status field for fast queries
- ✅ Efficient cron job for expiration
- ✅ Comprehensive error handling

This comprehensive exam flow API provides all necessary functionality for managing exam attempts, from starting and resuming to expiring and cancelling, with detailed status tracking and statistics.
