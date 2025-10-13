# Section-Specific Exam Complete Workflow Test Script

This script demonstrates the complete workflow for taking a section-specific exam using the IELTS Academic Practice Test 1.

## 🎯 **Test Scenario: IELTS Listening Section**

### **Step 1: Start Section-Specific Attempt**

```bash
# Start Listening section attempt
curl -X POST http://localhost:4000/attempts/sections/start \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "examId": "68ea2625285f4daf28311d5b",
    "sectionId": "68ea2625285f4daf28311d33"
  }'
```

**Expected Response:**

```json
{
  "_id": "68ea2625285f4daf28311d5c",
  "userId": "68ea2625285f4daf28311d5b",
  "examId": "68ea2625285f4daf28311d5b",
  "attemptType": "section_only",
  "activeSectionId": "68ea2625285f4daf28311d33",
  "status": "in_progress",
  "startedAt": "2025-01-12T10:00:00.000Z",
  "expiresAt": "2025-01-12T10:45:00.000Z",
  "sectionsStatus": [
    {
      "sectionId": "68ea2625285f4daf28311d33",
      "status": "in_progress"
    }
  ]
}
```

### **Step 2: Save Responses for All Questions**

#### **Question 1: Multiple Choice (Accommodation Type)**

```bash
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/responses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sectionId": "68ea2625285f4daf28311d33",
    "partId": "68ea2625285f4daf28311d2a",
    "groupId": "68ea2625285f4daf28311d25",
    "questionId": "68ea2625285f4daf28311d26",
    "response": "B",
    "timeSpentMs": 15000
  }'
```

#### **Question 2: Multiple Choice (Maximum Rent)**

```bash
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/responses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sectionId": "68ea2625285f4daf28311d33",
    "partId": "68ea2625285f4daf28311d2a",
    "groupId": "68ea2625285f4daf28311d25",
    "questionId": "68ea2625285f4daf28311d27",
    "response": "B",
    "timeSpentMs": 12000
  }'
```

#### **Question 3: Multiple Choice (Preferred Area)**

```bash
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/responses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sectionId": "68ea2625285f4daf28311d33",
    "partId": "68ea2625285f4daf28311d2a",
    "groupId": "68ea2625285f4daf28311d25",
    "questionId": "68ea2625285f4daf28311d28",
    "response": "B",
    "timeSpentMs": 10000
  }'
```

#### **Question 4: Text Completion (Library Founded Year)**

```bash
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/responses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sectionId": "68ea2625285f4daf28311d33",
    "partId": "68ea2625285f4daf28311d31",
    "groupId": "68ea2625285f4daf28311d2c",
    "questionId": "68ea2625285f4daf28311d2d",
    "response": "1872",
    "timeSpentMs": 8000
  }'
```

#### **Question 5: Text Completion (Architect Name)**

```bash
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/responses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sectionId": "68ea2625285f4daf28311d33",
    "partId": "68ea2625285f4daf28311d31",
    "groupId": "68ea2625285f4daf28311d2c",
    "questionId": "68ea2625285f4daf28311d2e",
    "response": "John Smith",
    "timeSpentMs": 10000
  }'
```

#### **Question 6: Text Completion (Number of Books)**

```bash
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/responses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sectionId": "68ea2625285f4daf28311d33",
    "partId": "68ea2625285f4daf28311d31",
    "groupId": "68ea2625285f4daf28311d2c",
    "questionId": "68ea2625285f4daf28311d2f",
    "response": "2 million",
    "timeSpentMs": 7000
  }'
```

### **Step 3: Submit the Section**

```bash
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/sections/68ea2625285f4daf28311d33/submit \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**

```json
{
  "message": "Section submitted",
  "sectionsStatus": [
    {
      "sectionId": "68ea2625285f4daf28311d33",
      "status": "submitted",
      "submittedAt": "2025-01-12T10:35:00.000Z",
      "score": 6,
      "maxScore": 6,
      "accuracy": 1.0
    }
  ],
  "attemptType": "section_only",
  "attemptStatus": "submitted"
}
```

## 🎯 **Alternative Test: Reading Section**

### **Start Reading Section Attempt**

```bash
curl -X POST http://localhost:4000/attempts/sections/start \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "examId": "68ea2625285f4daf28311d5b",
    "sectionId": "68ea2625285f4daf28311d3c"
  }'
```

### **Save Reading Responses**

```bash
# Question 1: Section A heading
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/responses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sectionId": "68ea2625285f4daf28311d3c",
    "partId": "68ea2625285f4daf28311d3a",
    "groupId": "68ea2625285f4daf28311d35",
    "questionId": "68ea2625285f4daf28311d36",
    "response": "i",
    "timeSpentMs": 30000
  }'

# Question 2: Section B heading
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/responses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sectionId": "68ea2625285f4daf28311d3c",
    "partId": "68ea2625285f4daf28311d3a",
    "groupId": "68ea2625285f4daf28311d35",
    "questionId": "68ea2625285f4daf28311d37",
    "response": "ii",
    "timeSpentMs": 25000
  }'

# Question 3: Section C heading
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/responses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sectionId": "68ea2625285f4daf28311d3c",
    "partId": "68ea2625285f4daf28311d3a",
    "groupId": "68ea2625285f4daf28311d35",
    "questionId": "68ea2625285f4daf28311d38",
    "response": "iii",
    "timeSpentMs": 20000
  }'
```

### **Submit Reading Section**

```bash
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/sections/68ea2625285f4daf28311d3c/submit \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🎯 **Writing Section Test (Long Text Responses)**

### **Start Writing Section Attempt**

```bash
curl -X POST http://localhost:4000/attempts/sections/start \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "examId": "68ea2625285f4daf28311d5b",
    "sectionId": "68ea2625285f4daf28311d48"
  }'
```

### **Save Writing Task 1 Response**

```bash
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/responses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sectionId": "68ea2625285f4daf28311d48",
    "partId": "68ea2625285f4daf28311d41",
    "groupId": "68ea2625285f4daf28311d3e",
    "questionId": "68ea2625285f4daf28311d3f",
    "response": "The chart illustrates the distribution of households across different income brackets in Country X over a 30-year period from 1990 to 2020. Overall, there has been a significant shift towards higher income brackets, with the middle-income group showing the most substantial growth.\n\nIn 1990, the largest proportion of households (35%) fell into the low-income bracket, while middle-income households accounted for 30% and high-income households for 20%. The remaining 15% were in the very high-income category.\n\nBy 2020, the distribution had changed dramatically. The middle-income bracket had become the largest group at 40%, representing a 10% increase. High-income households also increased significantly to 30%, while low-income households decreased to 25%. The very high-income bracket remained relatively stable at around 5%.\n\nThese changes suggest economic growth and improved living standards in Country X over the three-decade period.",
    "timeSpentMs": 1200000
  }'
```

### **Save Writing Task 2 Response**

```bash
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/responses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sectionId": "68ea2625285f4daf28311d48",
    "partId": "68ea2625285f4daf28311d46",
    "groupId": "68ea2625285f4daf28311d43",
    "questionId": "68ea2625285f4daf28311d44",
    "response": "Technology'\''s impact on modern life is a subject of ongoing debate, with compelling arguments on both sides regarding whether it complicates or simplifies our daily existence.\n\nThose who argue that technology complicates life point to several valid concerns. The constant connectivity through smartphones and social media can lead to information overload and increased stress. Many people find themselves overwhelmed by the sheer volume of notifications, emails, and digital demands.\n\nConversely, proponents of technology'\''s simplifying effects highlight numerous benefits. Smart home devices can automate routine tasks like adjusting temperature and lighting. Online banking and shopping eliminate the need for physical visits to banks and stores.\n\nIn my opinion, while technology does introduce certain complexities, its overall effect is overwhelmingly positive in terms of simplifying life. The key lies in learning to use technology mindfully and setting appropriate boundaries.",
    "timeSpentMs": 2400000
  }'
```

### **Submit Writing Section**

```bash
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/sections/68ea2625285f4daf28311d48/submit \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🎯 **Speaking Section Test (Audio Responses)**

### **Start Speaking Section Attempt**

```bash
curl -X POST http://localhost:4000/attempts/sections/start \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "examId": "68ea2625285f4daf28311d5b",
    "sectionId": "68ea2625285f4daf28311d59"
  }'
```

### **Save Speaking Responses with Audio**

```bash
# Part 1: Introduction
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/responses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sectionId": "68ea2625285f4daf28311d59",
    "partId": "68ea2625285f4daf28311d4d",
    "groupId": "68ea2625285f4daf28311d4a",
    "questionId": "68ea2625285f4daf28311d4b",
    "response": "I'\''m from Manchester, which is a vibrant city in the north of England. What I love most about my hometown is its rich cultural heritage and the friendly atmosphere.",
    "speakingAudioUrl": "https://s3.amazonaws.com/fluento-audio/speaking-response-1.mp3",
    "speakingTranscript": "I'\''m from Manchester, which is a vibrant city in the north of England. What I love most about my hometown is its rich cultural heritage and the friendly atmosphere.",
    "timeSpentMs": 60000
  }'

# Part 2: Long Turn
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/responses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sectionId": "68ea2625285f4daf28311d59",
    "partId": "68ea2625285f4daf28311d52",
    "groupId": "68ea2625285f4daf28311d4f",
    "questionId": "68ea2625285f4daf28311d50",
    "response": "I'\''d like to tell you about a journey I took to Japan last year, which was absolutely unforgettable. I went with my best friend Sarah, and we spent two weeks exploring different cities including Tokyo, Kyoto, and Osaka.",
    "speakingAudioUrl": "https://s3.amazonaws.com/fluento-audio/speaking-response-2.mp3",
    "speakingTranscript": "I'\''d like to tell you about a journey I took to Japan last year, which was absolutely unforgettable. I went with my best friend Sarah, and we spent two weeks exploring different cities including Tokyo, Kyoto, and Osaka.",
    "timeSpentMs": 120000
  }'
```

### **Submit Speaking Section**

```bash
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/sections/68ea2625285f4daf28311d59/submit \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🔍 **Verification Steps**

### **Check Attempt Status**

```bash
curl -X GET http://localhost:4000/attempts/68ea2625285f4daf28311d5c \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### **Get Section-Only Attempts**

```bash
curl -X GET http://localhost:4000/attempts/by-type/section_only \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### **Get Attempts for Specific Section**

```bash
curl -X GET http://localhost:4000/attempts/sections/68ea2625285f4daf28311d33 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## ✅ **Expected Results**

After completing any section workflow, you should see:

1. **Attempt Type**: `"section_only"`
2. **Active Section ID**: Set to the section you took
3. **Status**: `"submitted"` (entire attempt completed)
4. **Section Status**: `"submitted"` with score and accuracy
5. **Scoring**: Automatic calculation based on correct answers

## 🚨 **Error Testing**

### **Test Invalid Section ID**

```bash
curl -X POST http://localhost:4000/attempts/sections/start \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "examId": "68ea2625285f4daf28311d5b",
    "sectionId": "invalid_section_id"
  }'
```

### **Test Expired Attempt**

```bash
# Try to save response after expiration
curl -X POST http://localhost:4000/attempts/68ea2625285f4daf28311d5c/responses \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sectionId": "68ea2625285f4daf28311d33",
    "partId": "68ea2625285f4daf28311d2a",
    "groupId": "68ea2625285f4daf28311d25",
    "questionId": "68ea2625285f4daf28311d26",
    "response": "B",
    "timeSpentMs": 15000
  }'
```

This complete workflow demonstrates how to use the section-specific exam functionality with real exam data and realistic responses!
