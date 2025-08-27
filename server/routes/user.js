const express = require('express');
const auth = require('../middlewares/auth');
const router = express.Router();
const upload = require('../middlewares/upload');
const sharp = require('sharp');
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
    const [progress] = await pool.query(`
      SELECT
        p.course_id,
        CASE
          WHEN t.passed = 1 THEN 'passed'
          WHEN p.status = 'completed' THEN 'completed'
          WHEN p.status = 'in_progress' THEN 'in_progress'
          ELSE 'not_started'
        END AS status
      FROM user_courses p
      LEFT JOIN user_tasks t ON t.user_id = p.user_id AND t.course_id = p.course_id
      WHERE p.user_id = ?
    `, [userId]);

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
  const uploadedPath = req.file.path; // physical path on disk
  // keep track of inserted row id so we can update it later
  let insertedId = null;

  try {
    // 1) Insert the user_tasks row first (so we have an id)
    const [insertResult] = await pool.query(
      `INSERT INTO user_tasks (user_id, course_id, image_url) VALUES (?, ?, ?)`,
      [userId, courseId, `/uploads/${req.file.filename}`]
    );
    insertedId = insertResult.insertId;

    // 2) Find the course reference image path (physical path)
    const [[courseRow]] = await pool.query('SELECT ref_image FROM courses WHERE id = ?', [courseId]);
    if (!courseRow || !courseRow.ref_image) {
      // cannot compare if reference doesn't exist
      return res.status(400).json({ message: 'Course reference image not found; uploaded saved.' });
    }

    // ref_image stored like '/uploads/filename'
    const refImageUrl = courseRow.ref_image;
    // remove leading slash then join to server uploads directory
    const refImageRel = refImageUrl.replace(/^\//, '');
    const refImagePath = path.join(__dirname, '..', refImageRel); // server/uploads/filename

    // 3) Normalize both images to same size and PNG format
    const SIZE = 256; // resolution to compare (tradeoff: speed vs detail)
    const uploadedBuf = await sharp(uploadedPath)
      .resize(SIZE, SIZE, { fit: 'cover' })
      .png()
      .toBuffer();

    const refBuf = await sharp(refImagePath)
      .resize(SIZE, SIZE, { fit: 'cover' })
      .png()
      .toBuffer();

    // 4) Read PNGs into pngjs structures
    const img1 = PNG.sync.read(uploadedBuf);
    const img2 = PNG.sync.read(refBuf);

    // sanity: ensure same dims
    const { width, height } = img1;
    if (width !== img2.width || height !== img2.height) {
      // should not happen due to resize, but just in case
      return res.status(500).json({ message: 'Image size mismatch during comparison' });
    }

    // 5) Compare with pixelmatch
    const diff = new PNG({ width, height });
    const diffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, {
      threshold: 0.12, // tweakable: 0.08-0.15 typical
    });

    const totalPixels = width * height;
    const similarity = 1 - diffPixels / totalPixels; // 0..1 (1 = identical)
    const similarityPercent = Math.round(similarity * 10000) / 100; // two decimals

    // 6) Decide pass/fail
    const PASS_THRESHOLD = 0.60; // 60% similarity -> pass (you can tune)
    const passed = similarity >= PASS_THRESHOLD ? 1 : 0;

    // 7) Update the user_tasks row with computed values
    await pool.query(
      'UPDATE user_tasks SET similarity_score = ?, passed = ? WHERE id = ?',
      [similarityPercent, passed, insertedId]
    );

    // 8) If passed: promote user_progress to 'passed' so next course unlocks
    if (passed) {
      await pool.query(
        `INSERT INTO user_progress (user_id, course_id, status, completed_at)
         VALUES (?, ?, 'passed', NOW())
         ON DUPLICATE KEY UPDATE status = 'passed', completed_at = NOW()`,
        [userId, courseId]
      );
    }

    // 9) Return result to client
    res.json({
      message: passed ? 'Task passed! Next course unlocked.' : 'Task submitted — not similar enough. Try again.',
      similarity: similarityPercent,
      passed: !!passed,
      imageUrl: `/uploads/${req.file.filename}`, // uploaded image
      refImageUrl: refImageUrl // send reference image
    });
  } catch (err) {
    console.error('❌ Task upload/compare error:', err);

    // If we inserted a DB row but then failed, you may want to keep it or clean it up.
    return res.status(500).json({ message: 'Server error during task processing' });
  }
});


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

module.exports = router;
