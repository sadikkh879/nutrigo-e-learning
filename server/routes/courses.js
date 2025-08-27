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

module.exports = router;
