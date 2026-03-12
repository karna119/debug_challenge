import express from 'express';
import cors from 'cors';
import { exec } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import Database from 'better-sqlite3';

const app = express();
const port = 3001;
const db = new Database('data.db');

app.use(cors());
app.use(express.json());

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    uid TEXT PRIMARY KEY,
    name TEXT,
    studentId TEXT,
    teamNo TEXT,
    score INTEGER DEFAULT 0,
    startTime TEXT,
    completed BOOLEAN DEFAULT 0,
    lastActive TEXT
  );

  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT,
    questionId TEXT,
    code TEXT,
    language TEXT,
    status TEXT,
    timestamp TEXT
  );

  CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    points INTEGER,
    python_code TEXT,
    java_code TEXT,
    c_code TEXT,
    cpp_code TEXT,
    test_cases TEXT,
    language TEXT
  );
`);

// --- Code Execution ---
app.post('/api/execute', async (req, res) => {
  const { language, sourceCode } = req.body;

  if (language !== 'python') {
    return res.status(400).json({ error: 'Only Python is supported in offline mode currently.' });
  }

  const fileName = `temp_${Date.now()}.py`;
  const filePath = join(process.cwd(), fileName);

  try {
    await writeFile(filePath, sourceCode);

    exec(`python "${filePath}"`, (error, stdout, stderr) => {
      unlink(filePath).catch(console.error);

      res.json({
        stdout: stdout,
        stderr: stderr,
        output: stdout || stderr,
        code: error ? error.code : 0,
        signal: null
      });
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Mock Firestore API ---

// Questions API
app.get('/api/questions', (req, res) => {
  const questions = db.prepare('SELECT * FROM questions').all();
  // Parse test_cases JSON string
  const formatted = questions.map(q => ({
    ...q,
    buggyCode: {
      python: q.python_code,
      java: q.java_code,
      c: q.c_code,
      cpp: q.cpp_code
    },
    testCases: JSON.parse(q.test_cases || '[]'),
    language: q.language
  }));
  res.json(formatted);
});

app.post('/api/questions', (req, res) => {
  const { title, description, points, buggyCode, testCases, language } = req.body;
  const stmt = db.prepare(`
    INSERT INTO questions (title, description, points, python_code, java_code, c_code, cpp_code, test_cases, language)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    title,
    description,
    points,
    buggyCode.python,
    buggyCode.java,
    buggyCode.c,
    buggyCode.cpp,
    JSON.stringify(testCases),
    language
  );
  res.json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/questions/:id', (req, res) => {
  const { title, description, points, buggyCode, testCases, language } = req.body;
  const stmt = db.prepare(`
    UPDATE questions SET 
      title = ?, description = ?, points = ?, 
      python_code = ?, java_code = ?, c_code = ?, cpp_code = ?, 
      test_cases = ?, language = ?
    WHERE id = ?
  `);
  stmt.run(
    title,
    description,
    points,
    buggyCode.python,
    buggyCode.java,
    buggyCode.c,
    buggyCode.cpp,
    JSON.stringify(testCases),
    language,
    req.params.id
  );
  res.json({ success: true });
});

app.delete('/api/questions/:id', (req, res) => {
  db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// User Login/Get
app.get('/api/users/:uid', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE uid = ?').get(req.params.uid);
  res.json(user || null);
});

app.post('/api/users', (req, res) => {
  const { uid, name, studentId, teamNo, score, startTime, completed, lastActive } = req.body;
  const stmt = db.prepare(`
    INSERT INTO users (uid, name, studentId, teamNo, score, startTime, completed, lastActive)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(uid) DO UPDATE SET 
      score = excluded.score,
      completed = excluded.completed,
      lastActive = excluded.lastActive
  `);
  stmt.run(uid, name, studentId, teamNo, score, startTime, completed ? 1 : 0, lastActive);
  res.json({ success: true });
});

// Leaderboard
app.get('/api/leaderboard', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY score DESC LIMIT 50').all();
  res.json(users);
});

// All Users (Admin)
app.get('/api/admin/users', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY lastActive DESC').all();
  res.json(users);
});

// Reset Leaderboard (Admin)
app.post('/api/admin/reset', (req, res) => {
  try {
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM submissions').run();
      db.prepare('UPDATE users SET score = 0, completed = 0').run();
    });
    transaction();
    res.json({ success: true });
  } catch (err: any) {
    console.error('Reset error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Submissions
app.post('/api/submissions', (req, res) => {
  const { userId, questionId, code, language, status, timestamp } = req.body;

  try {
    const insertSubmission = db.prepare(`
      INSERT INTO submissions (userId, questionId, code, language, status, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Use a transaction for consistent updates
    const transaction = db.transaction(() => {
      insertSubmission.run(userId, questionId, code, language, status, timestamp);

      if (status === 'correct') {
        const question = db.prepare('SELECT points FROM questions WHERE id = ?').get(questionId);
        const points = question ? question.points : 0;

        if (points > 0) {
          const updateScore = db.prepare(`
            UPDATE users 
            SET score = score + ?, 
                lastActive = ? 
            WHERE uid = ?
          `);
          updateScore.run(points, timestamp, userId);
        }
      }
    });

    transaction();
    res.json({ success: true });
  } catch (err: any) {
    console.error('Submission error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Offline backend running at http://localhost:${port}`);
});
