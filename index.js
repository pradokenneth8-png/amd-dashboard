const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_Szu1CKI8pqYN@ep-delicate-dawn-a1thm5ic-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
});

// --- EMAIL SETUP ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'amdteam.noreply@gmail.com', 
    pass: 'fcveurqubbvfuknw' // <-- IMPORTANT: Replace with your actual Google App Password
  }
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
    const { username, password, email, team_id } = req.body;
    const check = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (check.rows.length > 0) return res.status(400).json({ success: false, message: "Username taken" });
    
    await pool.query(
        'INSERT INTO users (username, password, email, team_id) VALUES ($1, $2, $3, $4)', 
        [username, password, email || null, team_id || null]
    );

    // Send Welcome Email
    if (email) {
        let teamName = 'Asset Management Department';
        if (team_id) {
            const teamRes = await pool.query('SELECT name FROM teams WHERE id = $1', [team_id]);
            if (teamRes.rows.length > 0) teamName = teamRes.rows[0].name;
        }

        const mailOptions = {
            from: '"AMD Portal" <amdteam.noreply@gmail.com>',
            to: email,
            subject: 'Welcome to the AMD Enterprise Portal',
            html: `
                <div style="font-family: sans-serif; padding: 20px;">
                    <h2 style="color: #ED1C24; font-style: italic;">AMD ACCESS GRANTED</h2>
                    <p>Hello <strong>${username}</strong>,</p>
                    <p>Your account has been successfully created and linked to the <strong>${teamName}</strong> team.</p>
                    <p>You will now receive automated updates and deadline notifications for your team's projects.</p>
                    <br/>
                    <p style="font-size: 12px; color: gray;">This is an automated message. Please do not reply.</p>
                </div>
            `
        };
        transporter.sendMail(mailOptions, (error) => {
            if (error) console.error('Error sending welcome email:', error);
        });
    }

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

// Fetches projects based on Active vs Archived status
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
    const { name, progress, status, secondary_team, remarks, start_date, end_date, user, team_id } = req.body;
    await pool.query(
      'UPDATE projects SET name=$1, progress=$2, status=$3, secondary_team=$4, remarks=$5, start_date=$6, end_date=$7 WHERE id=$8', 
      [name, progress, status, secondary_team, remarks, start_date, end_date, req.params.id]
    );
    await pool.query('INSERT INTO audit_logs (project_id, action, changed_by) VALUES ($1, $2, $3)', 
      [req.params.id, `Updated details & progress to ${progress}%`, user || 'Anonymous']);

    // --- GET USERS IN THIS PROJECT'S TEAM AND SEND UPDATE EMAIL ---
    if (team_id) {
        const teamUsers = await pool.query('SELECT email FROM users WHERE team_id = $1 AND email IS NOT NULL', [team_id]);
        const emailList = teamUsers.rows.map(u => u.email).join(',');

        if (emailList.length > 0) {
            const mailOptions = {
                from: '"AMD Portal" <amdteam.noreply@gmail.com>',
                to: emailList,
                subject: `AMD Update: Project "${name}" is now ${status}`,
                html: `<h3>Project Update</h3><p><strong>${name}</strong> has been updated to <strong>${progress}% (${status})</strong>.</p><p>Remarks: ${remarks}</p>`
            };
            transporter.sendMail(mailOptions, (error) => { if(error) console.error(error); });
        }
    }

    res.json({ message: "Updated" });
  } catch (err) { res.status(500).send(err.message); }
});

// Archive Route
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

// --- AUTOMATED NOTIFICATIONS (CRON JOB) ---
// Runs every morning at 8:00 AM server time
cron.schedule('0 8 * * *', async () => {
    console.log("Running Daily Project Status Check...");
    try {
        const query = `
            SELECT p.name, p.end_date, p.progress, t.name as team_name, u.email,
                   DATE_PART('day', p.end_date::timestamp - CURRENT_DATE::timestamp) as days_left
            FROM projects p
            JOIN teams t ON p.team_id = t.id
            JOIN users u ON u.team_id = t.id
            WHERE p.status != 'Completed' AND p.archived = FALSE AND u.email IS NOT NULL
        `;
        
        const result = await pool.query(query);
        if (result.rows.length === 0) return;

        const userAlerts = {};
        
        result.rows.forEach(row => {
            let urgency = null;
            if (row.days_left < 0) urgency = 'PAST DUE 🚨';
            else if (row.days_left === 0) urgency = 'DEADLINE TODAY ⚠️';
            else if (row.days_left > 0 && row.days_left <= 2) urgency = 'NEAR DEADLINE ⏳';

            if (urgency) {
                if (!userAlerts[row.email]) userAlerts[row.email] = { team: row.team_name, items: [] };
                userAlerts[row.email].items.push(`
                    <li style="margin-bottom: 10px;">
                        <strong>${row.name}</strong> - <span style="color:#ED1C24;">${urgency}</span><br/>
                        Due Date: ${new Date(row.end_date).toLocaleDateString()} | Progress: ${row.progress}%
                    </li>
                `);
            }
        });

        for (const [email, data] of Object.entries(userAlerts)) {
            const mailOptions = {
                from: '"AMD Portal" <amdteam.noreply@gmail.com>',
                to: email,
                subject: `AMD Portal: ${data.items.length} Action(s) Required for ${data.team}`,
                html: `
                    <div style="font-family: sans-serif; padding: 20px;">
                        <h2 style="color: #ED1C24; font-style: italic;">AMD DAILY STATUS REPORT</h2>
                        <p>The following active projects for the <strong>${data.team}</strong> team require your attention:</p>
                        <ul style="background: #f9fafb; padding: 15px 30px; border-radius: 8px; border: 1px solid #e5e7eb;">
                            ${data.items.join('')}
                        </ul>
                        <p>Please log in to the AMD Enterprise Portal to update the progress or remarks.</p>
                    </div>
                `
            };
            transporter.sendMail(mailOptions, (err) => { 
                if(err) console.error(`Email failed for ${email}:`, err); 
            });
        }
    } catch (err) {
        console.error("Cron Job Error:", err.message);
    }
});

app.listen(port, '0.0.0.0', () => console.log(`AMD Enterprise Server running on ${port}`));