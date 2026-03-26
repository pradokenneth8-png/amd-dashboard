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
      const userRole = result.rows[0].role || 'editor';
      res.json({ success: true, username: result.rows[0].username, role: userRole });
    } else {
      res.status(401).json({ success: false, message: "Invalid username or password" });
    }
  } catch (err) { res.status(500).send(err.message); }
});

app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const check = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (check.rows.length > 0) return res.status(400).json({ success: false, message: "Username taken" });
    
    await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, password]);
    res.json({ success: true });
  } catch (err) { res.status(500).send(err.message); }
});

// --- CORE DATA ---
app.get('/teams', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM teams ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) { res.status(500).send(err.message); }
});

// UPDATED: Fetches projects based on Active vs Archived status
app.get('/projects', async (req, res) => {
  try {
    const { team_id, status, showArchived } = req.query;
    let query = 'SELECT p.*, t.name as team_name FROM projects p JOIN teams t ON p.team_id = t.id';
    let params = [];
    let conditions = [];

    // Filter by archived status (Defaults to showing active projects)
    const isArchived = showArchived === 'true';
    conditions.push(`p.archived = ${isArchived ? 'TRUE' : 'FALSE'}`);

    if (team_id && team_id !== "all") { 
        params.push(team_id); 
        conditions.push(`p.team_id = $${params.length}`); 
    }
    if (status && status !== "all") { 
        params.push(status); 
        conditions.push(`p.status = $${params.length}`); 
    }

    if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY p.id DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).send(err.message); }
});

// --- AUDIT HISTORY ---
app.get('/logs', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT al.*, p.name as project_name FROM audit_logs al 
      LEFT JOIN projects p ON al.project_id = p.id 
      ORDER BY al.timestamp DESC LIMIT 50
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).send(err.message); }
});

app.delete('/logs', async (req, res) => {
  try {
    await pool.query('DELETE FROM audit_logs');
    res.json({ message: "History Cleared" });
  } catch (err) { res.status(500).send(err.message); }
});

// --- PROJECT MUTATIONS ---
app.post('/projects', async (req, res) => {
  try {
    const { name, team_id, secondary_team, status, start_date, end_date, progress, remarks, user } = req.body;
    const result = await pool.query(
      'INSERT INTO projects (name, team_id, secondary_team, status, start_date, end_date, progress, remarks) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', 
      [name, team_id, secondary_team, status, start_date, end_date, progress, remarks]
    );
    await pool.query('INSERT INTO audit_logs (project_id, action, changed_by) VALUES ($1, $2, $3)', 
      [result.rows[0].id, `Created project`, user || 'Anonymous']);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).send(err.message); }
});

app.put('/projects/:id', async (req, res) => {
  try {
    const { name, progress, status, secondary_team, remarks, start_date, end_date, user } = req.body;
    await pool.query(
      'UPDATE projects SET name=$1, progress=$2, status=$3, secondary_team=$4, remarks=$5, start_date=$6, end_date=$7 WHERE id=$8', 
      [name, progress, status, secondary_team, remarks, start_date, end_date, req.params.id]
    );
    await pool.query('INSERT INTO audit_logs (project_id, action, changed_by) VALUES ($1, $2, $3)', 
      [req.params.id, `Updated details & progress to ${progress}%`, user || 'Anonymous']);
    res.json({ message: "Updated" });
  } catch (err) { res.status(500).send(err.message); }
});

// NEW: Archive Route
app.put('/projects/:id/archive', async (req, res) => {
    try {
        const { user } = req.body;
        await pool.query('UPDATE projects SET archived = TRUE WHERE id = $1', [req.params.id]);
        await pool.query('INSERT INTO audit_logs (project_id, action, changed_by) VALUES ($1, $2, $3)', 
            [req.params.id, `Project moved to Archive`, user || 'Anonymous']);
        res.json({ message: "Project Archived" });
    } catch (err) { res.status(500).send(err.message); }
});

app.delete('/projects/:id', async (req, res) => {
  try {
    const projectId = req.params.id;
    await pool.query('INSERT INTO audit_logs (project_id, action, changed_by) VALUES ($1, $2, $3)', 
      [projectId, `Deleted project ID: ${projectId}`, 'System']);
    await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
    res.json({ message: "Deleted" });
  } catch (err) { res.status(500).send(err.message); }
});

app.listen(port, () => console.log(`AMD Enterprise Server running on ${port}`));