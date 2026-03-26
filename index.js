const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_Szu1CKI8pqYN@ep-delicate-dawn-a1thm5ic-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
});

// --- AUTHENTICATION ---
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
    if (result.rows.length > 0) {
      const user = result.rows[0];
      res.json({ success: true, username: user.username, role: user.role || 'viewer' });
    } else {
      res.status(401).json({ success: false, message: "Invalid username or password" });
    }
  } catch (err) { res.status(500).send(err.message); }
});

// --- CORE DATA ---
app.get('/teams', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM teams ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).send(err.message); }
});

app.get('/projects', async (req, res) => {
  try {
    const { team_id } = req.query;
    let query = 'SELECT p.*, t.name as team_name FROM projects p JOIN teams t ON p.team_id = t.id';
    let params = [];
    
    if (team_id && team_id !== "all") { 
        params.push(team_id); 
        query += ' WHERE p.team_id = $1'; 
    }
    
    query += ' ORDER BY p.id DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).send(err.message); }
});

app.listen(port, () => console.log(`AMD Server running on ${port}`));