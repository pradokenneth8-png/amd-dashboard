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

// Get Teams
app.get('/teams', async (req, res) => {
  const result = await pool.query('SELECT * FROM teams');
  res.json(result.rows);
});

// Get all Projects (with dates for the Gantt chart)
app.get('/projects', async (req, res) => {
  const result = await pool.query('SELECT p.*, t.name as team_name FROM projects p JOIN teams t ON p.team_id = t.id');
  res.json(result.rows);
});

// Save a New Project (Unified Form)
app.post('/projects', async (req, res) => {
  try {
    const { name, team_id, status, start_date, end_date, progress } = req.body;
    const result = await pool.query(
      'INSERT INTO projects (name, team_id, status, start_date, end_date, progress) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, team_id, status, start_date, end_date, progress]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).send(err.message);
  }
});
// DELETE a Project
app.delete('/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM projects WHERE id = $1', [id]);
    res.json({ message: "Project deleted!" });
  } catch (err) {
    res.status(500).send(err.message);
  }
});
app.listen(port, () => console.log(`AMD Dashboard running on ${port}`));