const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');

// GET /api/courses — list all courses
router.get('/', async (req, res) => {
  const pool = req.app.locals.pool;
  try {
    const [rows] = await pool.query(
      'SELECT id, title, description, ref_image FROM courses'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching courses.' });
  }
});

// GET /api/courses/:id — single course with blocks
router.get('/:id', auth, async (req, res) => {
  const pool = req.app.locals.pool;
  const courseId = req.params.id;

  try {
    const [[course]] = await pool.query(
      'SELECT id, title, description, ref_image AS image FROM courses WHERE id = ?',
      [courseId]
    );

    if (!course) {
      return res.status(404).json({ message: 'Course not found' });
    }

    const [blocks] = await pool.query(
      'SELECT block_index, type, content FROM course_blocks WHERE course_id = ? ORDER BY block_index',
      [courseId]
    );

    res.json({ ...course, blocks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching course' });
  }
});

router.get('/progress_course', async (req, res) => {
  const pool = req.app.locals.pool;
  const userId = req.user.id;

  try {
    // 1. Get passed course IDs
    const [rows] = await pool.query(
      `SELECT course_id FROM user_course WHERE status = 'passed' AND user_id = ?`,
      [userId]
    );

    const courseIds = rows.map(r => r.course_id);

    // 2. If no passed courses, return empty array
    if (courseIds.length === 0) {
      return res.json([]);
    }

    // 3. Fetch matching courses
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
