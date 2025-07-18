const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const upload = require('../middlewares/upload');

// POST /api/admin/courses – add a new course
router.post('/courses', auth, upload.single('refImage'), async (req, res) => {
  const { title, description } = req.body;
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Access denied' });
  if (!req.file) return res.status(400).json({ message: 'Reference image is required' });

  const refImage = `/uploads/${req.file.filename}`;

  try {
    const pool = req.app.locals.pool;
    const [result] = await pool.query(
      'INSERT INTO courses (title, description, ref_image) VALUES (?, ?, ?)',
      [title, description, refImage]
    );
    const courseId = result.insertId;

    res.status(201).json({ message: 'Course created successfully', id: courseId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'DB error when creating course.' });
  }
});


// POST /api/admin/courses/:id/blocks
router.post('/courses/:id/blocks', auth, async (req, res) => {
  try {
    const pool = req.app.locals.pool;

    const courseId = req.params.id; // ✅ define this BEFORE using it
    const { blocks } = req.body;

    console.log('📥 BLOCKS POST triggered');
    console.log('Raw req.body:', req.body);
    console.log('Received courseId:', courseId);
    console.log('Received blocks:', blocks);

    // Delete existing blocks (optional)
    await pool.query('DELETE FROM course_blocks WHERE course_id = ?', [courseId]);

    // Insert new blocks
    const insertPromises = blocks.map((b, i) =>
      pool.query(
        'INSERT INTO course_blocks (course_id, block_index, type, content) VALUES (?, ?, ?, ?)',
        [courseId, i, b.type, b.content]
      )
    );

    await Promise.all(insertPromises);
    res.json({ message: 'Blocks updated successfully' });

  } catch (err) {
    console.error('❌ Error inserting blocks:', err);
    res.status(500).json({ message: 'Failed to save content blocks.' });
  }
});


module.exports = router;
