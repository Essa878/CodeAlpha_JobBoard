import 'dotenv/config';
import { getDb } from './db.js';
import { hashPassword } from './auth.js';

const email = (process.env.ADMIN_EMAIL || 'admin@jobboard.local').toLowerCase();
const password = process.env.ADMIN_PASSWORD || 'admin1234';
const name = process.env.ADMIN_NAME || 'Administrator';

const db = getDb();
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
  console.log(`Existing user ${email} promoted to admin.`);
} else {
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run(name, email, hashPassword(password), 'admin');
  console.log(`Admin created: ${email} / ${password}`);
}
