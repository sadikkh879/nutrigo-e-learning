const express = require('express');
const auth = require('../middlewares/auth');
const router = express.Router();
const upload = require('../middlewares/upload');

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
  const pool = req.app.locals.pool;
  const userId = req.user.id;
  const courseId = req.params.courseId;

  if (!req.file) {
    return res.status(400).json({ message: 'No image uploaded' });
  }

  const imageUrl = `/uploads/${req.file.filename}`;

  try {
    await pool.query(
      `INSERT INTO user_tasks (user_id, course_id, image_url) VALUES (?, ?, ?)`,
      [userId, courseId, imageUrl]
    );
    res.status(200).json({ message: 'Image uploaded! We will now compare it.', imageUrl });
  } catch (err) {
    console.error('❌ Task upload error:', err);
    res.status(500).json({ message: 'Error saving task image' });
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
    const [taskRows] = await pool.query(
      `SELECT passed FROM user_tasks WHERE user_id = ? AND course_id = ? ORDER BY id DESC LIMIT 1`,
      [userId, courseId]
    );

    if (!taskRows.length || taskRows[0].passed !== 1) {
      return res.status(400).json({ message: 'You must complete and pass the task before finishing the course.' });
    }

    const now = new Date();

    const [rows] = await pool.query(
      'SELECT * FROM user_courses WHERE user_id = ? AND course_id = ?',
      [userId, courseId]
    );

    if (rows.length) {
      await pool.query(
        `UPDATE user_courses SET status = 'completed', completed_at = ? WHERE user_id = ? AND course_id = ?`,
        [now, userId, courseId]
      );
    } else {
      await pool.query(
        `INSERT INTO user_courses (user_id, course_id, status, completed_at) VALUES (?, ?, 'completed', ?)`,
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
