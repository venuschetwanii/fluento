# S3 Upload API Test Examples

This document provides practical examples for testing the S3 upload API endpoints.

## Prerequisites

1. **Authentication**: Get a valid JWT token from the auth endpoint
2. **Environment**: Ensure S3 is configured in your `.env` file
3. **File Size**: Keep files under 50MB limit

## Video Upload Examples

### 1. Upload Course Video

```bash
# Using curl
curl -X POST http://localhost:4000/uploads/direct \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@ielts-listening-practice.mp4" \
  -F "folder=videos/courses/ielts"
```

**Expected Response:**

```json
{
  "key": "videos/courses/ielts/1705123456789-ielts-listening-practice.mp4",
  "publicUrl": "https://your-bucket.s3.your-region.amazonaws.com/videos/courses/ielts/1705123456789-ielts-listening-practice.mp4",
  "contentType": "video/mp4",
  "size": 45678912
}
```

### 2. Upload Exam Instruction Video

```bash
curl -X POST http://localhost:4000/uploads/direct \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@toefl-speaking-instructions.mp4" \
  -F "folder=videos/exams/toefl/instructions"
```

### 3. Upload Sample Video

```bash
curl -X POST http://localhost:4000/uploads/direct \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@gre-sample-essay.mp4" \
  -F "folder=videos/samples/gre"
```

## PDF Upload Examples

### 1. Upload Course Material

```bash
curl -X POST http://localhost:4000/uploads/direct \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@ielts-writing-guide.pdf" \
  -F "folder=documents/materials/ielts"
```

**Expected Response:**

```json
{
  "key": "documents/materials/ielts/1705123456789-ielts-writing-guide.pdf",
  "publicUrl": "https://your-bucket.s3.your-region.amazonaws.com/documents/materials/ielts/1705123456789-ielts-writing-guide.pdf",
  "contentType": "application/pdf",
  "size": 2048576
}
```

### 2. Upload Practice Test

```bash
curl -X POST http://localhost:4000/uploads/direct \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@toefl-practice-test-1.pdf" \
  -F "folder=documents/practice-tests/toefl"
```

### 3. Upload Exam Instructions

```bash
curl -X POST http://localhost:4000/uploads/direct \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@pte-exam-guidelines.pdf" \
  -F "folder=documents/instructions/pte"
```

## Transcription Examples

### 1. Start Transcription Job

```bash
curl -X POST http://localhost:4000/uploads/transcribe \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "videos/courses/ielts/1705123456789-ielts-listening-practice.mp4",
    "mediaFormat": "mp4",
    "languageCode": "en-US"
  }'
```

**Expected Response:**

```json
{
  "jobName": "transcribe-1705123456789-abc123",
  "status": "IN_PROGRESS"
}
```

### 2. Check Transcription Status

```bash
curl -X GET http://localhost:4000/uploads/transcribe/transcribe-1705123456789-abc123 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (Completed):**

```json
{
  "status": "COMPLETED",
  "transcriptFileUri": "https://your-bucket.s3.your-region.amazonaws.com/transcripts/transcribe-1705123456789-abc123.json"
}
```

## Presigned URL Examples

### 1. Get Presigned URL for Private File

```bash
curl -X GET "http://localhost:4000/uploads/url?key=videos/courses/ielts/1705123456789-ielts-listening-practice.mp4&expiresIn=3600" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**

```json
{
  "url": "https://your-bucket.s3.your-region.amazonaws.com/videos/courses/ielts/1705123456789-ielts-listening-practice.mp4?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=..."
}
```

### 2. Get Presigned URL with Download Disposition

```bash
curl -X GET "http://localhost:4000/uploads/url?key=documents/materials/ielts/1705123456789-ielts-writing-guide.pdf&expiresIn=1800&responseContentDisposition=attachment;%20filename%3D%22ielts-writing-guide.pdf%22" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## JavaScript/Fetch Examples

### 1. Upload Video with Progress

```javascript
const uploadVideo = async (file, folder = "videos/courses") => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  try {
    const response = await fetch("http://localhost:4000/api/uploads/direct", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: formData,
    });

    const result = await response.json();
    console.log("Upload successful:", result);
    return result;
  } catch (error) {
    console.error("Upload failed:", error);
    throw error;
  }
};

// Usage
const fileInput = document.getElementById("videoFile");
const file = fileInput.files[0];
uploadVideo(file, "videos/courses/ielts");
```

### 2. Upload PDF

```javascript
const uploadPDF = async (file, folder = "documents") => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("folder", folder);

  try {
    const response = await fetch("http://localhost:4000/api/uploads/direct", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: formData,
    });

    const result = await response.json();
    console.log("PDF upload successful:", result);
    return result;
  } catch (error) {
    console.error("PDF upload failed:", error);
    throw error;
  }
};
```

### 3. Start Transcription

```javascript
const startTranscription = async (
  key,
  mediaFormat = "mp4",
  languageCode = "en-US"
) => {
  try {
    const response = await fetch(
      "http://localhost:4000/api/uploads/transcribe",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          key,
          mediaFormat,
          languageCode,
        }),
      }
    );

    const result = await response.json();
    console.log("Transcription started:", result);
    return result;
  } catch (error) {
    console.error("Transcription failed:", error);
    throw error;
  }
};
```

## Error Handling Examples

### Common Error Responses

```json
// File not provided
{
  "error": "file is required"
}

// Unsupported file type
{
  "error": "Unsupported contentType"
}

// S3 not configured
{
  "error": "S3 not configured (AWS_S3_BUCKET, AWS_S3_REGION)"
}

// Key not provided for transcription
{
  "error": "key is required"
}

// Media format not supported
{
  "error": "mediaFormat is required or inferable from key"
}
```

## Testing Checklist

- [ ] Video upload (MP4, AVI, MOV, WMV, FLV, WebM, MKV)
- [ ] PDF upload
- [ ] Large file upload (near 50MB limit)
- [ ] Invalid file type upload
- [ ] Missing authentication token
- [ ] Transcription job start
- [ ] Transcription status check
- [ ] Presigned URL generation
- [ ] Presigned URL with custom expiration
- [ ] Presigned URL with download disposition

## File Organization Best Practices

### Recommended Folder Structure

```
videos/
├── courses/
│   ├── ielts/
│   ├── toefl/
│   ├── gre/
│   └── pte/
├── exams/
│   ├── ielts/
│   ├── toefl/
│   ├── gre/
│   └── pte/
├── instructions/
└── samples/

documents/
├── materials/
├── practice-tests/
├── instructions/
└── transcripts/

audio/
├── recordings/
└── samples/
```

### Naming Conventions

- Use timestamps: `{timestamp}-{descriptive-name}.{extension}`
- Use lowercase with hyphens: `ielts-listening-practice.mp4`
- Include exam type in folder structure: `videos/courses/ielts/`
- Use descriptive names: `toefl-speaking-task-1-instructions.mp4`
