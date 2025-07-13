require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const authRoutes = require('./routes/auth');

const app = express();
app.use(cors());
app.use(express.json());

// Set up MySQL connection pool
app.locals.pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

// Routes
app.use('/api/auth', authRoutes);

// Server listen
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

app.get('/', (req, res) => {
  res.send('NutriGo server is live!');
});

