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

// --- TEAMS ---
app.get('/teams', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM teams ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).send(err.message); }
});

// --- PROJECTS (With Filters) ---
app.get('/projects', async (req, res) => {
  try {
    const { team_id, status } = req.query;
    let query = 'SELECT p.*, t.name as team_name FROM projects p JOIN teams t ON p.team_id = t.id';
    let params = [];
    let conditions = [];

    if (team_id && team_id !== "all") {
      params.push(team_id);
      conditions.push(`p.team_id = $${params.length}`);
    }
    if (status && status !== "all") {
      params.push(status);
      conditions.push(`p.status = $${params.length}`);
    }
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY p.id DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).send(err.message); }
});

// --- AUDIT LOGS (Project History) ---
app.get('/logs', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT al.*, p.name as project_name 
      FROM audit_logs al 
      LEFT JOIN projects p ON al.project_id = p.id 
      ORDER BY al.timestamp DESC LIMIT 50
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).send(err.message); }
});

// --- CREATE PROJECT (With Logging) ---
app.post('/projects', async (req, res) => {
  try {
    const { name, team_id, secondary_team, status, start_date, end_date, progress, remarks, user } = req.body;
    
    // 1. Insert Project
    const result = await pool.query(
      'INSERT INTO projects (name, team_id, secondary_team, status, start_date, end_date, progress, remarks) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', 
      [name, team_id, secondary_team, status, start_date, end_date, progress, remarks]
    );
    
    const newProject = result.rows[0];

    // 2. Log Creation
    await pool.query(
      'INSERT INTO audit_logs (project_id, action, changed_by) VALUES ($1, $2, $3)',
      [newProject.id, `Created project: ${name}`, user || 'admin']
    );

    res.json(newProject);
  } catch (err) { res.status(500).send(err.message); }
});

// --- UPDATE PROJECT (With Logging) ---
app.put('/projects/:id', async (req, res) => {
  try {
    const { name, progress, status, secondary_team, remarks, user } = req.body;
    const projectId = req.params.id;

    // 1. Update Project
    await pool.query(
      'UPDATE projects SET name = $1, progress = $2, status = $3, secondary_team = $4, remarks = $5 WHERE id = $6', 
      [name, progress, status, secondary_team, remarks, projectId]
    );

    // 2. Log Update
    await pool.query(
      'INSERT INTO audit_logs (project_id, action, changed_by) VALUES ($1, $2, $3)',
      [projectId, `Updated progress to ${progress}% and status to ${status}`, user || 'admin']
    );

    res.json({ message: "Updated and Logged!" });
  } catch (err) { res.status(500).send(err.message); }
});

// --- DELETE PROJECT (With Logging) ---
app.delete('/projects/:id', async (req, res) => {
  try {
    const projectId = req.params.id;

    // 1. Log Deletion (Do this BEFORE deleting so the ID still exists in logs)
    await pool.query(
      'INSERT INTO audit_logs (project_id, action, changed_by) VALUES ($1, $2, $3)',
      [projectId, `Deleted project ID: ${projectId}`, 'admin']
    );

    // 2. Delete Project
    await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
    
    res.json({ message: "Deleted and Logged!" });
  } catch (err) { res.status(500).send(err.message); }
});

app.listen(port, () => console.log(`AMD Dashboard running on ${port}`));