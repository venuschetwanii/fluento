# Course Payloads Documentation

This directory contains comprehensive course payloads for creating courses in the Fluento backend system. The payloads are organized by exam type and include all necessary fields for course creation.

## 📁 Files Overview

### Main Files

- `course_payloads.json` - Complete collection of all course payloads
- `ielts_course_payloads.json` - IELTS-specific course payloads
- `toefl_course_payloads.json` - TOEFL-specific course payloads
- `gre_course_payloads.json` - GRE-specific course payloads
- `pte_course_payloads.json` - PTE-specific course payloads

## 🎯 Course Types Covered

### 1. IELTS Courses

- **IELTS Academic Complete Preparation Course** - Comprehensive prep for all sections
- **IELTS General Training Mastery** - Specialized for immigration/work purposes
- **IELTS Writing Task 1 & 2 Excellence** - Deep dive into writing tasks
- **IELTS Speaking Confidence Builder** - Speaking skills and confidence
- **IELTS Listening Strategies & Practice** - Listening section mastery
- **IELTS Reading Comprehension Mastery** - Reading strategies and techniques

### 2. TOEFL Courses

- **TOEFL iBT Complete Preparation Course** - Full TOEFL preparation
- **TOEFL Speaking & Writing Mastery** - Advanced speaking and writing
- **TOEFL Reading Comprehension Strategies** - Reading section strategies
- **TOEFL Listening Skills Enhancement** - Listening improvement
- **TOEFL Integrated Writing Tasks** - Integrated writing mastery

### 3. GRE Courses

- **GRE Complete Preparation Program** - Comprehensive GRE prep
- **GRE Analytical Writing Excellence** - Writing section mastery
- **GRE Quantitative Reasoning Mastery** - Math and quantitative skills
- **GRE Verbal Reasoning Strategies** - Verbal section strategies
- **GRE Math Fundamentals Review** - Math fundamentals review

### 4. PTE Courses

- **PTE Academic Complete Preparation** - Full PTE preparation
- **PTE Speaking & Pronunciation Mastery** - Speaking and pronunciation
- **PTE Writing Skills Excellence** - Writing section mastery
- **PTE Reading & Listening Strategies** - Reading and listening skills
- **PTE Academic Practice Tests** - Practice tests and analysis

## 📋 Course Schema Fields

Each course payload includes the following fields:

### Required Fields

- `title` - Course title
- `examType` - Type of exam (IELTS Academic, TOEFL iBT, GRE General, PTE Academic)
- `description` - Detailed course description
- `shortDescription` - Brief course summary
- `status` - Course status ("published" or "draft")
- `publishedBy` - ID of the user who published the course
- `type` - Material type ("video" or "pdf")
- `url` - S3 URL for the course material

### Optional Fields

- `publishedAt` - Publication date (null for drafts)
- `createdAt` - Creation timestamp (auto-generated)
- `updatedAt` - Last update timestamp (auto-generated)

## 🚀 Usage Examples

### Creating a Single Course

```bash
curl -X POST http://localhost:3000/api/courses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d @ielts_course_payloads.json
```

### Creating Multiple Courses

```bash
# Create all IELTS courses
curl -X POST http://localhost:3000/api/courses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d @ielts_course_payloads.json

# Create all TOEFL courses
curl -X POST http://localhost:3000/api/courses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d @toefl_course_payloads.json
```

### Sample Course Payload

```json
{
  "title": "IELTS Academic Complete Preparation Course",
  "examType": "IELTS Academic",
  "description": "Comprehensive IELTS Academic preparation covering all four sections: Listening, Reading, Writing, and Speaking. Includes practice tests, strategies, and personalized feedback.",
  "shortDescription": "Complete IELTS Academic prep with practice tests and strategies",
  "status": "published",
  "publishedBy": "68ea2625285f4daf28311d5b",
  "publishedAt": "2025-01-11T10:00:00.000Z",
  "type": "video",
  "url": "https://s3.amazonaws.com/fluento-courses/ielts-academic-complete.mp4"
}
```

## 🔧 API Endpoints

### Course Management

- `POST /api/courses` - Create a new course
- `GET /api/courses` - List all courses (with pagination and filtering)
- `GET /api/courses/:id` - Get a specific course
- `PUT /api/courses/:id` - Update a course
- `DELETE /api/courses/:id` - Delete a course (soft delete)
- `PATCH /api/courses/:id/restore` - Restore a deleted course

### Course Filtering

- Filter by exam type: `GET /api/courses?examType=IELTS Academic`
- Filter by status: `GET /api/courses?status=published`
- Filter by publishedBy: `GET /api/courses?publishedBy=USER_ID`
- Search by title: `GET /api/courses?search=IELTS`

## 📊 Course Statistics

The payloads include realistic course statistics:

- **IELTS Courses**: 6 courses covering all sections
- **TOEFL Courses**: 5 courses with comprehensive coverage
- **GRE Courses**: 5 courses for all test sections
- **PTE Courses**: 5 courses for communicative skills

## 🎨 Material Types

### Video Courses

- Complete preparation courses
- Section-specific mastery courses
- Strategy and technique courses

### PDF Courses

- Writing excellence guides
- Reading strategies
- Practice test materials

## 🔐 Authentication & Authorization

All course creation endpoints require:

- Valid JWT token
- Appropriate user role (instructor/admin)
- Valid `publishedBy` user ID

## 📝 Notes

1. **S3 URLs**: All course materials are stored in S3 with organized folder structure
2. **PublishedBy**: Use valid user IDs from your system
3. **Status**: Use "published" for live courses, "draft" for work in progress
4. **Exam Types**: Match the exact exam type strings used in your system
5. **Timestamps**: Use ISO 8601 format for dates

## 🧪 Testing

The payloads have been tested and verified to work with the course creation API. You can use them directly or modify them according to your specific requirements.

## 📞 Support

For questions about course payloads or API usage, refer to the main API documentation or contact the development team.
