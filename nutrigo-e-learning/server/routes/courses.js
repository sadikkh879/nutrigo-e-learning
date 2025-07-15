const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');

// 1. List all courses with images
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

// 2. Single course with dynamic blocks
router.get('/:id', auth, async (req, res) => {
  const pool = req.app.locals.pool;
  const { id } = req.params;
  try {
    // Fetch basic course info
    const [[course]] = await pool.query(
      'SELECT id, title, description, ref_image AS image FROM courses WHERE id = ?',
      [id]
    );
    if (!course) return res.status(404).json({ message: 'Course not found' });

    // Fetch content blocks in order
    const [blocks] = await pool.query(
      'SELECT block_index, type, content FROM course_blocks WHERE course_id = ? ORDER BY block_index',
      [id]
    );

    res.json({ ...course, blocks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching course' });
  }
});

// 3. Mark course complete
router.post('/:id/complete', auth, async (req, res) => {
  const pool = req.app.locals.pool;
  const { id } = req.params;
  const userId = req.user.id;

  try {
    await pool.query(
      'INSERT INTO course_completion (user_id, course_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE completed = TRUE',
      [userId, id]
    );
    res.json({ message: 'Course marked as completed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error marking course completed' });
  }
});

module.exports = router;
