const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Register Route
router.post('/register', async (req, res) => {
  const { firstName, lastName, birthDate, email, password, role } = req.body;

  if (!email || !password || !firstName || !lastName || !birthDate) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const pool = req.app.locals.pool;
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length) return res.status(400).json({ message: 'Email already exists.' });

    const hashed = await bcrypt.hash(password, 10);

    // Insert user
    const [result] = await pool.query(
      'INSERT INTO users (first_name, last_name, birth_date, email, password, role) VALUES (?, ?, ?, ?, ?, ?)',
      [firstName, lastName, birthDate, email, hashed, role || 'user']
    );
    const userId = result.insertId;

    // Generate token + expiry
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 min

    await pool.query(
      'INSERT INTO email_verifications (user_id, token, expires_at) VALUES (?, ?, ?)',
      [userId, token, expiresAt]
    );

    // Send email
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 2525,
  secure: false, // true for port 465, false for 587/2525
  auth: {
    user: process.env.SMTP_USERS,
    pass: process.env.SMTP_PASSWORD
  }
});

    const verificationLink = `${process.env.BACKEND_URL}/api/auth/verify-email?token=${token}`;
    //const verificationLink = `http://localhost:5000/api/auth/verify-email?token=${token}`;

    await transporter.sendMail({
      from: 'Nutrigo <emilyygreyy749@gmail.com>',
      to: email,
      subject: 'Verify your NutriGo email',
      html: `<p>Hi ${firstName},</p>
             <p>Please verify your email by clicking the link below:</p>
             <a href="${verificationLink}">Verify Email</a>`
    });

    res.status(201).json({ message: 'Registration successful. Please check your email to verify your account.' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});


router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Missing verification token.');

  try {
    const pool = req.app.locals.pool;
    const [rows] = await pool.query(
      'SELECT user_id FROM email_verifications WHERE token = ? AND expires_at > NOW()',
      [token]
    );

    if (!rows.length) {
      return res.status(400).send('Invalid or expired token.');
    }

    const userId = rows[0].user_id;

    // Mark verified
    await pool.query(
      'UPDATE users SET email_verified = 1 WHERE id = ?',
      [userId]
    );

    // Remove token
    await pool.query(
      'DELETE FROM email_verifications WHERE user_id = ?',
      [userId]
    );

    // Styled HTML response
    res.send(`
      <html>
        <head>
          <title>Email Verified</title>
          <style>
            body { font-family: 'Segoe UI', sans-serif; background: #f4f6f8; text-align: center; padding: 4rem; }
            .message { background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); display: inline-block; }
            h2 { color: #28a745; }
            a { display: inline-block; margin-top: 1rem; color: #007bff; text-decoration: none; font-weight: 500; }
          </style>
        </head>
        <body>
          <div class="message">
            <h2>✅ Email Verified Successfully!</h2>
            <p>You can now log in to NutriGo.</p>
            <a href="/index.html">Go to Login</a>
          </div>
        </body>
      </html>
    `);

  } catch (err) {
    console.error(err);
    res.status(500).send('Server error during verification.');
  }
});


// User Login Route
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const pool = req.app.locals.pool;
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows.length) return res.status(400).json({ message: 'Invalid credentials.' });

    const user = rows[0];

    if (!user.email_verified) {
  return res.status(403).json({ message: 'Please verify your email before logging in.' });
}

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: 'Invalid credentials.' });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({ token, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during login.' });
  }
});


// Admin Login Route
router.post('/adminlogin', async (req, res) => {
  const { email, password } = req.body;

  try {
    const pool = req.app.locals.pool;
    const [rows] = await pool.query('SELECT * FROM admin WHERE email = ?', [email]);
    if (!rows.length) return res.status(400).json({ message: 'Invalid credentials.' });

    const user = rows[0];

      if (password !== user.password) {
      return res.status(400).json({ message: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({ token, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error during admin login.' });
  }
});

module.exports = router;
