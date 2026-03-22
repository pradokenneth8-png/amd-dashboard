const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();
// Cloud servers assign their own ports, so we use process.env.PORT
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json()); 

// Tells the server to show your index.html file to visitors
app.use(express.static(__dirname));

// Cloud Database Connection (PASTE YOUR NEON LINK HERE!)
const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_Szu1CKI8pqYN@ep-delicate-dawn-a1thm5ic-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
});

// Fetch Teams
app.get('/teams', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM teams');
    res.json(result.rows);
  } catch (err) {
    res.status(500).send('Database error');
  }
});

// Fetch Projects
app.get('/projects', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM projects');
    res.json(result.rows);
  } catch (err) {
    res.status(500).send('Database error');
  }
});

// Fetch Tasks
app.get('/tasks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tasks');
    res.json(result.rows);
  } catch (err) {
    res.status(500).send('Database error');
  }
});

// Save Project
app.post('/projects', async (req, res) => {
  try {
    const { name, team_id, status } = req.body;
    const newProject = await pool.query(
      'INSERT INTO projects (name, team_id, status) VALUES ($1, $2, $3) RETURNING *',
      [name, team_id, status]
    );
    res.json(newProject.rows[0]);
  } catch (err) {
    res.status(500).send('Database error');
  }
});

// Save Task
app.post('/tasks', async (req, res) => {
  try {
    const { project_id, task_name, start_date, end_date, progress } = req.body;
    const newTask = await pool.query(
      'INSERT INTO tasks (project_id, task_name, start_date, end_date, progress) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [project_id, task_name, start_date, end_date, progress]
    );
    res.json(newTask.rows[0]);
  } catch (err) {
    res.status(500).send('Database error');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});