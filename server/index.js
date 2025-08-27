require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const authRoutes = require('./routes/auth');
const path = require ('path');
const auth = require ('./middlewares/auth');
const coursesRoutes = require('./routes/courses');
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/courses', auth, coursesRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);

// Set up MySQL connection pool
async function initDb() {
  try {
    app.locals.pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
    });
    // Try a quick query to confirm connection
    await app.locals.pool.query('SELECT 1');
    console.log('✅ Database connected');
  } catch (err) {
    console.error('⚠️ Database connection failed:', err.message);
    app.locals.pool = null; // Prevents routes from using a bad pool
  }
}

initDb();


// Routes
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api/auth', authRoutes);

// Server listen
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


