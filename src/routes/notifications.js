import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate } from '../auth.js';

const router = Router();

function view(row) {
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    jobId: row.job_id,
    applicationId: row.application_id,
    isRead: !!row.is_read,
    createdAt: row.created_at,
  };
}

router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100')
    .all(req.user.id);
  const unread = db
    .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(req.user.id).c;
  res.json({ unread, notifications: rows.map(view) });
});

router.post('/read-all', authenticate, (req, res) => {
  const info = getDb()
    .prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0')
    .run(req.user.id);
  res.json({ updated: info.changes });
});

router.post('/:id/read', authenticate, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Notification not found' });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: 'Not your notification' });
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(row.id);
  res.json({ id: row.id, isRead: true });
});

router.delete('/:id', authenticate, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM notifications WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Notification not found' });
  if (row.user_id !== req.user.id) return res.status(403).json({ error: 'Not your notification' });
  db.prepare('DELETE FROM notifications WHERE id = ?').run(row.id);
  res.json({ deleted: true, id: row.id });
});

export default router;
