# Section-Specific Exam API Testing Guide

This guide provides practical examples for testing the new section-specific exam functionality.

## 🚀 **New Features Added**

1. **Section-Specific Exam Start**: Start exam for only one section
2. **Attempt Type Tracking**: Distinguish between full exam and section-only attempts
3. **Enhanced Querying**: Filter attempts by type and section
4. **Smart Section Submission**: Auto-complete section-only attempts when section is submitted

## 📋 **Testing Checklist**

### ✅ **Section-Specific Exam Start**

- [ ] Start section-specific attempt
- [ ] Verify attemptType is "section_only"
- [ ] Verify activeSectionId is set correctly
- [ ] Verify only one section in sectionsStatus
- [ ] Verify expiration time is section-specific

### ✅ **Full Exam Start (Updated)**

- [ ] Start full exam attempt
- [ ] Verify attemptType is "full_exam"
- [ ] Verify all sections in sectionsStatus
- [ ] Verify expiration time is exam duration

### ✅ **Attempt Querying**

- [ ] Get all attempts
- [ ] Filter by attemptType (full_exam)
- [ ] Filter by attemptType (section_only)
- [ ] Get attempts for specific section
- [ ] Pagination works correctly

### ✅ **Section Submission**

- [ ] Submit section in section-only attempt (should complete attempt)
- [ ] Submit section in full exam attempt (should only complete section)
- [ ] Verify scoring works correctly for both types

## 🧪 **Test Examples**

### 1. **Start Section-Specific Exam**

```bash
# Start IELTS Listening section only
curl -X POST http://localhost:4000/attempts/sections/start \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "examId": "68ea2625285f4daf28311d5b",
    "sectionId": "68ea2625285f4daf28311d5d"
  }'
```

**Expected Response:**

```json
{
  "_id": "68ea2625285f4daf28311d5c",
  "userId": "68ea2625285f4daf28311d5b",
  "examId": "68ea2625285f4daf28311d5b",
  "attemptType": "section_only",
  "activeSectionId": "68ea2625285f4daf28311d5d",
  "status": "in_progress",
  "startedAt": "2025-01-12T10:00:00.000Z",
  "expiresAt": "2025-01-12T10:30:00.000Z",
  "sectionsStatus": [
    {
      "sectionId": "68ea2625285f4daf28311d5d",
      "status": "in_progress"
    }
  ]
}
```

### 2. **Start Full Exam (Updated)**

```bash
# Start full IELTS exam
curl -X POST http://localhost:4000/attempts/resume \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "examId": "68ea2625285f4daf28311d5b"
  }'
```

**Expected Response:**

```json
{
  "_id": "68ea2625285f4daf28311d5c",
  "userId": "68ea2625285f4daf28311d5b",
  "examId": "68ea2625285f4daf28311d5b",
  "attemptType": "full_exam",
  "status": "in_progress",
  "startedAt": "2025-01-12T10:00:00.000Z",
  "expiresAt": "2025-01-12T13:00:00.000Z",
  "sectionsStatus": [
    {
      "sectionId": "68ea2625285f4daf28311d5d",
      "status": "in_progress"
    },
    {
      "sectionId": "68ea2625285f4daf28311d5e",
      "status": "in_progress"
    },
    {
      "sectionId": "68ea2625285f4daf28311d5f",
      "status": "in_progress"
    },
    {
      "sectionId": "68ea2625285f4daf28311d5g",
      "status": "in_progress"
    }
  ]
}
```

### 3. **Get Section-Only Attempts**

```bash
# Get all section-only attempts
curl -X GET http://localhost:4000/attempts/by-type/section_only \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**

```json
{
  "items": [
    {
      "_id": "68ea2625285f4daf28311d5c",
      "userId": "68ea2625285f4daf28311d5b",
      "examId": "68ea2625285f4daf28311d5b",
      "attemptType": "section_only",
      "activeSectionId": "68ea2625285f4daf28311d5d",
      "status": "submitted",
      "startedAt": "2025-01-12T10:00:00.000Z",
      "submittedAt": "2025-01-12T10:25:00.000Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "attemptType": "section_only"
}
```

### 4. **Get Full Exam Attempts**

```bash
# Get all full exam attempts
curl -X GET http://localhost:4000/attempts/by-type/full_exam \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 5. **Get Attempts for Specific Section**

```bash
# Get all attempts for IELTS Listening section
curl -X GET http://localhost:4000/attempts/sections/68ea2625285f4daf28311d5d \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 6. **Submit Section in Section-Only Attempt**

```bash
# Submit section (this will complete the entire attempt)
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/sections/68ea2625285f4daf28311d5d/submit \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**

```json
{
  "message": "Section submitted",
  "sectionsStatus": [
    {
      "sectionId": "68ea2625285f4daf28311d5d",
      "status": "submitted",
      "submittedAt": "2025-01-12T10:25:00.000Z",
      "score": 8.5,
      "maxScore": 10,
      "accuracy": 0.85
    }
  ],
  "attemptType": "section_only",
  "attemptStatus": "submitted"
}
```

### 7. **Submit Section in Full Exam Attempt**

```bash
# Submit section (this will only complete the section, not the entire exam)
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/sections/68ea2625285f4daf28311d5d/submit \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**

```json
{
  "message": "Section submitted",
  "sectionsStatus": [
    {
      "sectionId": "68ea2625285f4daf28311d5d",
      "status": "submitted",
      "submittedAt": "2025-01-12T10:25:00.000Z",
      "score": 8.5,
      "maxScore": 10,
      "accuracy": 0.85
    },
    {
      "sectionId": "68ea2625285f4daf28311d5e",
      "status": "in_progress"
    }
  ],
  "attemptType": "full_exam",
  "attemptStatus": "in_progress"
}
```

## 🔍 **Advanced Filtering Examples**

### Filter by Multiple Criteria

```bash
# Get submitted section-only attempts for specific exam
curl -X GET "http://localhost:4000/attempts/by-type/section_only?examId=68ea2625285f4daf28311d5b&status=submitted" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get in-progress full exam attempts with pagination
curl -X GET "http://localhost:4000/attempts/by-type/full_exam?status=in_progress&page=2&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get all attempts with attemptType filter
curl -X GET "http://localhost:4000/attempts?attemptType=section_only&status=submitted" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🎯 **JavaScript/Frontend Examples**

### Start Section-Specific Exam

```javascript
const startSectionExam = async (examId, sectionId) => {
  try {
    const response = await fetch(
      "http://localhost:4000/attempts/sections/start",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          examId,
          sectionId,
        }),
      }
    );

    const attempt = await response.json();
    console.log("Section exam started:", attempt);
    return attempt;
  } catch (error) {
    console.error("Failed to start section exam:", error);
    throw error;
  }
};
```

### Get Attempts by Type

```javascript
const getAttemptsByType = async (attemptType, filters = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (filters.examId) queryParams.append("examId", filters.examId);
    if (filters.status) queryParams.append("status", filters.status);
    if (filters.page) queryParams.append("page", filters.page);
    if (filters.limit) queryParams.append("limit", filters.limit);

    const response = await fetch(
      `http://localhost:4000/attempts/by-type/${attemptType}?${queryParams}`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );

    const data = await response.json();
    console.log(`${attemptType} attempts:`, data);
    return data;
  } catch (error) {
    console.error(`Failed to get ${attemptType} attempts:`, error);
    throw error;
  }
};

// Usage
const sectionAttempts = await getAttemptsByType("section_only", {
  status: "submitted",
});
const fullExamAttempts = await getAttemptsByType("full_exam", {
  status: "in_progress",
});
```

### Check Exam Type and Start Appropriately

```javascript
const startExam = async (examId, sectionId = null) => {
  try {
    // First, check if exam is section-specific
    const examResponse = await fetch(
      `http://localhost:4000/exams/open/${examId}`
    );
    const exam = await examResponse.json();

    const isSectionSpecific = exam.sections && exam.sections.length > 1;

    if (isSectionSpecific && sectionId) {
      // Start section-specific exam
      return await startSectionExam(examId, sectionId);
    } else if (isSectionSpecific && !sectionId) {
      // Show section selection UI
      throw new Error("Section ID required for section-specific exam");
    } else {
      // Start full exam
      return await startFullExam(examId);
    }
  } catch (error) {
    console.error("Failed to start exam:", error);
    throw error;
  }
};

const startFullExam = async (examId) => {
  const response = await fetch("http://localhost:4000/attempts/resume", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${localStorage.getItem("token")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ examId }),
  });

  return await response.json();
};
```

## 🚨 **Error Testing**

### Test Invalid Section ID

```bash
curl -X POST http://localhost:4000/attempts/sections/start \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "examId": "68ea2625285f4daf28311d5b",
    "sectionId": "invalid_section_id"
  }'
```

**Expected Error:**

```json
{
  "error": "Section not found in this exam"
}
```

### Test Invalid Attempt Type

```bash
curl -X GET http://localhost:4000/attempts/by-type/invalid_type \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Error:**

```json
{
  "error": "Invalid attemptType. Must be 'full_exam' or 'section_only'"
}
```

## 📊 **Performance Testing**

### Test with Large Datasets

```bash
# Test pagination with large result sets
curl -X GET "http://localhost:4000/attempts/by-type/section_only?page=1&limit=100" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Test filtering performance
curl -X GET "http://localhost:4000/attempts?attemptType=full_exam&status=submitted&examId=68ea2625285f4daf28311d5b" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## ✅ **Validation Checklist**

- [ ] Section-specific attempts have `attemptType: "section_only"`
- [ ] Full exam attempts have `attemptType: "full_exam"`
- [ ] Section-only attempts have `activeSectionId` set
- [ ] Section-only attempts have only one section in `sectionsStatus`
- [ ] Section submission completes section-only attempts
- [ ] Section submission doesn't complete full exam attempts
- [ ] All existing functionality still works
- [ ] Pagination works correctly
- [ ] Filtering works correctly
- [ ] Error handling works correctly
