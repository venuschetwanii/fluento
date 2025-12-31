const Router = require("express").Router;
const auth = require("../middlewares/auth.middleware");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const multer = require("multer");
const {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
} = require("@aws-sdk/client-transcribe");

const router = Router();
router.use(auth);

// Initialize S3 client from env
const s3 = new S3Client({
  region: process.env.AWS_S3_REGION,
  credentials: process.env.AWS_S3_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
      }
    : undefined,
});

// Initialize Transcribe client
const transcribe = new TranscribeClient({
  region: process.env.AWS_S3_REGION,
  credentials: process.env.AWS_S3_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
      }
    : undefined,
});
// Generate presigned GET URL to fetch a stored object (useful if ACL is private)
router.get("/url", async (req, res) => {
  try {
    const { key, expiresIn = 300, responseContentDisposition } = req.query;
    if (!key) return res.status(400).json({ error: "key is required" });

    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket || !process.env.AWS_S3_REGION)
      return res
        .status(500)
        .json({ error: "S3 not configured (AWS_S3_BUCKET, AWS_S3_REGION)" });

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: responseContentDisposition,
    });
    const url = await getSignedUrl(s3, command, {
      expiresIn: Number(expiresIn) || 300,
    });
    return res.json({ url });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Multer memory storage for server-side upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB cap; adjust as needed
  },
});

// Upload a single file via multipart/form-data and push to S3
router.post("/direct", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const { folder = "uploads", acl = "public-read" } = req.body || {};
    if (!file) return res.status(400).json({ error: "file is required" });

    const bucket = process.env.AWS_S3_BUCKET;
    const region = process.env.AWS_S3_REGION;
    const accessKeyId = process.env.AWS_S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_S3_SECRET_ACCESS_KEY;
    
    if (!bucket || !region) {
      return res
        .status(500)
        .json({ error: "S3 not configured: AWS_S3_BUCKET and AWS_S3_REGION are required" });
    }
    
    if (!accessKeyId || !secretAccessKey) {
      return res
        .status(500)
        .json({ error: "S3 credentials not configured: AWS_S3_ACCESS_KEY_ID and AWS_S3_SECRET_ACCESS_KEY are required" });
    }

    // Basic validation for media types
    const allowedPrefixes = [
      "image/",
      "video/",
      "audio/",
      "application/pdf",
      "application/octet-stream",
    ];
    const contentType = file.mimetype || "application/octet-stream";
    if (!allowedPrefixes.some((p) => String(contentType).startsWith(p))) {
      return res.status(400).json({ error: "Unsupported contentType" });
    }

    const key = `${folder.replace(
      /\/+$/,
      ""
    )}/${Date.now()}-${encodeURIComponent(file.originalname)}`;
    const put = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: file.buffer,
      ContentType: contentType,
    });
    await s3.send(put);

    const publicUrl = `https://${bucket}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${key}`;
    return res.json({ key, publicUrl, contentType, size: file.size });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Start an AWS Transcribe job for an uploaded S3 object
router.post("/transcribe", async (req, res) => {
  try {
    const { key, mediaFormat, languageCode = "en-US" } = req.body || {};
    if (!key) return res.status(400).json({ error: "key is required" });

    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket || !process.env.AWS_S3_REGION)
      return res
        .status(500)
        .json({ error: "S3 not configured (AWS_S3_BUCKET, AWS_S3_REGION)" });

    const fmt =
      mediaFormat ||
      (key.toLowerCase().endsWith(".mp3")
        ? "mp3"
        : key.toLowerCase().endsWith(".mp4")
        ? "mp4"
        : key.toLowerCase().endsWith(".wav")
        ? "wav"
        : key.toLowerCase().endsWith(".flac")
        ? "flac"
        : undefined);
    if (!fmt)
      return res
        .status(400)
        .json({ error: "mediaFormat is required or inferable from key" });

    const jobName = `transcribe-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const mediaUri = `s3://${bucket}/${key}`;

    const cmd = new StartTranscriptionJobCommand({
      TranscriptionJobName: jobName,
      LanguageCode: languageCode,
      MediaFormat: fmt,
      Media: { MediaFileUri: mediaUri },
      OutputBucketName: process.env.AWS_S3_TRANSCRIPTS_BUCKET || bucket,
    });
    const out = await transcribe.send(cmd);
    return res.json({
      jobName,
      status: out.TranscriptionJob?.TranscriptionJobStatus,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Check the status of a Transcribe job; if completed, return transcript URI
router.get("/transcribe/:jobName", async (req, res) => {
  try {
    const { jobName } = req.params;
    if (!jobName) return res.status(400).json({ error: "jobName is required" });
    const out = await transcribe.send(
      new GetTranscriptionJobCommand({ TranscriptionJobName: jobName })
    );
    const job = out.TranscriptionJob;
    const status = job?.TranscriptionJobStatus;
    const transcriptFileUri = job?.Transcript?.TranscriptFileUri;
    return res.json({ status, transcriptFileUri });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
