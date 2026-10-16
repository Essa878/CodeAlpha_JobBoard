import { Router } from 'express';
import { getDb } from '../db.js';
import { hashPassword, verifyPassword, signToken, authenticate } from '../auth.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['candidate', 'employer'];

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, createdAt: row.created_at };
}

router.post('/register', (req, res, next) => {
  try {
    const { name, email, password, role = 'candidate', companyName } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email address' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'role must be candidate or employer' });
    if (role === 'employer' && !companyName) {
      return res.status(400).json({ error: 'companyName is required for employers' });
    }

    const db = getDb();
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase())) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const tx = db.transaction(() => {
      const info = db
        .prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
        .run(name, String(email).toLowerCase(), hashPassword(password), role);
      const userId = info.lastInsertRowid;
      if (role === 'employer') {
        db.prepare('INSERT INTO employers (user_id, company_name) VALUES (?, ?)').run(userId, companyName);
      } else {
        db.prepare('INSERT INTO candidates (user_id) VALUES (?)').run(userId);
      }
      return userId;
    });
    const userId = tx();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    return res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

router.post('/login', (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });
    const user = getDb().prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    return res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', authenticate, (req, res) => {
  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: publicUser(user) });
});

export default router;
