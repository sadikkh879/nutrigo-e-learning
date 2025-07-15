const express = require('express');
const auth = require('../middlewares/auth');
const router = express.Router();

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
    // Total meals and recent
    const [meals] = await pool.query(
      'SELECT course_id, timestamp, isHealthy FROM submissions WHERE user_id = ? ORDER BY timestamp DESC LIMIT 5',
      [req.user.id]
    );

    const totalMeals = meals.length;
    const healthyMeals = meals.filter(m => m.isHealthy).length;
    const goalsMet = healthyMeals; // Simplified

    // Fetch course titles for recent meals
    const recentMeals = await Promise.all(meals.map(async m => {
      const [[c]] = await pool.query('SELECT title FROM courses WHERE id = ?', [m.course_id]);
      return { courseTitle: c.title, timestamp: m.timestamp };
    }));

    res.json({ totalMeals, healthyMeals, goalsMet, recentMeals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching stats.' });
  }
});

module.exports = router;
