const express = require('express');
const auth = require('../middlewares/auth');
const multer = require('multer');
const router = express.Router();
//const upload = require('../middlewares/upload');
const sharp = require('sharp');
const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config();
const upload = multer({ storage: multer.memoryStorage() });
const containerName = 'nutrigoimages';
const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
let pixelmatch;
(async () => {
  pixelmatch = (await import('pixelmatch')).default;
})();
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

// GET /api/user/me — return first name
router.get('/me', auth, async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const [rows] = await pool.query(
      'SELECT first_name FROM users WHERE id = ?',
      [req.user.id]
    );
    res.json({ firstName: rows[0]?.first_name || '' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching user info.' });
  }
});

// GET /api/user/stats — meal count and recent activity
router.get('/stats', auth, async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const [meals] = await pool.query(
      'SELECT course_id, timestamp, isHealthy FROM submissions WHERE user_id = ? ORDER BY timestamp DESC LIMIT 5',
      [req.user.id]
    );

    const totalMeals = meals.length;
    const healthyMeals = meals.filter(m => m.isHealthy).length;
    const goalsMet = healthyMeals;

    const recentMeals = await Promise.all(meals.map(async m => {
      const [[c]] = await pool.query(
        'SELECT title FROM courses WHERE id = ?',
        [m.course_id]
      );
      return { courseTitle: c?.title || 'Unknown', timestamp: m.timestamp };
    }));

    res.json({ totalMeals, healthyMeals, goalsMet, recentMeals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching stats.' });
  }
});

// GET /api/user/progress
router.get('/progress', auth, async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.user.id;

  try {
    const [progress] = await pool.query(
  `SELECT course_id, status
   FROM user_courses
   WHERE user_id = ?`,
  [userId]
);
    res.json(progress);
  } catch (err) {
    console.error('❌ Failed to fetch user progress:', err);
    res.status(500).json({ message: 'Error loading progress data' });
  }
});

// POST /api/user/task/:courseId — upload task image
router.post('/task/:courseId', auth, upload.single('mealImage'), async (req, res) => {
  const userId = req.user.id;
  const courseId = req.params.courseId;

  if (!req.file) {
    return res.status(400).json({ message: 'No image uploaded' });
  }

  const pool = req.app.locals.pool;
  let insertedId = null;

  try {
    // 1) Upload submitted image to Azure
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobName = `${Date.now()}-${req.file.originalname}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(req.file.buffer, {
      blobHTTPHeaders: { blobContentType: req.file.mimetype }
    });

    const imageUrl = blockBlobClient.url;

    // 2) Insert into user_tasks
    const [insertResult] = await pool.query(
      `INSERT INTO user_tasks (user_id, course_id, image_url) VALUES (?, ?, ?)`,
      [userId, courseId, imageUrl]
    );
    insertedId = insertResult.insertId;

    // 3) Get reference image URL from DB
    const [[courseRow]] = await pool.query(
      'SELECT ref_image FROM courses WHERE id = ?',
      [courseId]
    );
    if (!courseRow || !courseRow.ref_image) {
      return res.status(400).json({ message: 'Course reference image not found; uploaded saved.' });
    }

    const refImageUrl = courseRow.ref_image;

    // 4) Download reference image from Azure
    const refBlobName = decodeURIComponent(refImageUrl.split('/').pop());
    const refBlockBlobClient = containerClient.getBlockBlobClient(refBlobName);
    const downloadResponse = await refBlockBlobClient.download();
    const refImageBuffer = await streamToBuffer(downloadResponse.readableStreamBody);

    // 5) Normalize both images to same size and PNG format
    const SIZE = 256;
    const uploadedBuf = await sharp(req.file.buffer)
      .resize(SIZE, SIZE, { fit: 'cover' })
      .png()
      .toBuffer();

    const refBuf = await sharp(refImageBuffer)
      .resize(SIZE, SIZE, { fit: 'cover' })
      .png()
      .toBuffer();

    // 6) Compare with pixelmatch
    const img1 = PNG.sync.read(uploadedBuf);
    const img2 = PNG.sync.read(refBuf);

    const { width, height } = img1;
    if (width !== img2.width || height !== img2.height) {
      return res.status(500).json({ message: 'Image size mismatch during comparison' });
    }

    const diff = new PNG({ width, height });
    const diffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, {
      threshold: 0.12,
    });

    const totalPixels = width * height;
    const similarity = 1 - diffPixels / totalPixels;
    const similarityPercent = Math.round(similarity * 10000) / 100;

    // 7) Decide pass/fail
    const PASS_THRESHOLD = 0.60;
    const passed = similarity >= PASS_THRESHOLD ? 1 : 0;

    // 8) Update user_tasks with results
    await pool.query(
      'UPDATE user_tasks SET similarity_score = ?, passed = ? WHERE id = ?',
      [similarityPercent, passed, insertedId]
    );

    // 9) If passed, mark course as completed in user_progress
    if (passed) {
      await pool.query(
        `INSERT INTO user_courses (user_id, course_id, status, completed_at)
         VALUES (?, ?, 'passed', NOW())
         ON DUPLICATE KEY UPDATE status = 'passed', completed_at = NOW()`,
        [userId, courseId]
      );
    }

    // 10) Respond with Azure URLs
    res.json({
      message: passed
        ? 'Task passed! Next course unlocked.'
        : 'Task submitted — not similar enough. Try again.',
      similarity: similarityPercent,
      passed: !!passed,
      imageUrl,       // Azure URL of uploaded image
      refImageUrl     // Azure URL of reference image
    });

  } catch (err) {
    console.error('❌ Task upload/compare error:', err);
    return res.status(500).json({ message: 'Server error during task processing' });
  }
});

// Helper: convert Azure stream to buffer
async function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', (data) =>
      chunks.push(data instanceof Buffer ? data : Buffer.from(data))
    );
    readableStream.on('end', () => resolve(Buffer.concat(chunks)));
    readableStream.on('error', reject);
  });
}


// GET /api/user/task/:courseId/status — check if task passed
router.get('/task/:courseId/status', auth, async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.user.id;
  const courseId = req.params.courseId;

  try {
    const [rows] = await pool.query(
      'SELECT passed FROM user_tasks WHERE user_id = ? AND course_id = ? ORDER BY id DESC LIMIT 1',
      [userId, courseId]
    );

    res.json({ passed: rows[0]?.passed === 1 });
  } catch (err) {
    console.error('❌ Error checking task pass status:', err);
    res.status(500).json({ message: 'Error checking task status' });
  }
});

// POST /api/user/course/:id/start — mark course in progress
router.post('/course/:id/start', auth, async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.user.id;
  const courseId = req.params.id;

  try {
    const [rows] = await pool.query(
      'SELECT status FROM user_courses WHERE user_id = ? AND course_id = ?',
      [userId, courseId]
    );

    if (rows.length && rows[0].status === 'passed') {
      return res.json({ message: 'Already passed. No change.' });
    }

    if (rows.length && rows[0].status === 'completed') {
      return res.json({ message: 'Already completed. No change.' });
    }

    if (rows.length) {
      await pool.query(
        `UPDATE user_courses SET status = 'in_progress' WHERE user_id = ? AND course_id = ?`,
        [userId, courseId]
      );
    } else {
      await pool.query(
        `INSERT INTO user_courses (user_id, course_id, status) VALUES (?, ?, 'in_progress')`,
        [userId, courseId]
      );
    }

    res.json({ message: 'Course marked as in progress' });
  } catch (err) {
    console.error('❌ Error setting in-progress:', err);
    res.status(500).json({ message: 'Error setting course progress' });
  }
});

// POST /api/user/course/:id/complete — mark course as completed
router.post('/course/:id/complete', auth, async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.user.id;
  const courseId = req.params.id;

  try {
    const now = new Date();

    const [rows] = await pool.query(
      'SELECT * FROM user_courses WHERE user_id = ? AND course_id = ?',
      [userId, courseId]
    );

    if (rows.length && rows[0].status === 'passed') {
      return res.json({ message: 'Already passed. No change.' });
    }

    if (rows.length) {
      await pool.query(
        `UPDATE user_courses 
         SET status = 'completed', completed_at = ? 
         WHERE user_id = ? AND course_id = ?`,
        [now, userId, courseId]
      );
    } else {
      await pool.query(
        `INSERT INTO user_courses (user_id, course_id, status, completed_at) 
         VALUES (?, ?, 'completed', ?)`,
        [userId, courseId, now]
      );
    }

    res.json({ message: 'Course marked as completed!' });
  } catch (err) {
    console.error('❌ Error updating progress:', err);
    res.status(500).json({ message: 'Server error updating progress' });
  }
});

router.get('/progress_course', auth, async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.user.id;

  try {
    const [rows] = await pool.query(
      `SELECT course_id FROM user_courses WHERE status = 'passed' AND user_id = ?`,
      [userId]
    );

    const courseIds = rows.map(r => r.course_id);
    if (courseIds.length === 0) return res.json([]);

    const placeholders = courseIds.map(() => '?').join(',');
    const [courses] = await pool.query(
      `SELECT * FROM courses WHERE id IN (${placeholders})`,
      courseIds
    );

    res.json(courses);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching passed courses.' });
  }
});



module.exports = router;
