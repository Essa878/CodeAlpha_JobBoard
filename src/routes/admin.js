import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate, requireRole } from '../auth.js';

const router = Router();

router.get('/reports/employer', authenticate, requireRole('employer'), (req, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT j.id, j.title, j.status,
              COUNT(a.id) AS total,
              SUM(CASE WHEN a.status = 'applied' THEN 1 ELSE 0 END) AS applied,
              SUM(CASE WHEN a.status = 'reviewing' THEN 1 ELSE 0 END) AS reviewing,
              SUM(CASE WHEN a.status = 'shortlisted' THEN 1 ELSE 0 END) AS shortlisted,
              SUM(CASE WHEN a.status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
              SUM(CASE WHEN a.status = 'hired' THEN 1 ELSE 0 END) AS hired
       FROM jobs j LEFT JOIN applications a ON a.job_id = j.id
       WHERE j.employer_id = ?
       GROUP BY j.id ORDER BY j.created_at DESC`
    )
    .all(req.user.id);

  const report = rows.map((r) => ({
    jobId: r.id,
    title: r.title,
    status: r.status,
    totalApplications: r.total,
    byStatus: {
      applied: r.applied || 0,
      reviewing: r.reviewing || 0,
      shortlisted: r.shortlisted || 0,
      rejected: r.rejected || 0,
      hired: r.hired || 0,
    },
  }));

  const totals = report.reduce(
    (acc, r) => {
      acc.totalApplications += r.totalApplications;
      acc.hired += r.byStatus.hired;
      acc.shortlisted += r.byStatus.shortlisted;
      return acc;
    },
    { totalApplications: 0, hired: 0, shortlisted: 0 }
  );

  res.json({ totals, jobs: report });
});

router.get('/admin/stats', authenticate, requireRole('admin'), (req, res) => {
  const db = getDb();
  const count = (sql) => db.prepare(sql).get().c;
  res.json({
    users: count('SELECT COUNT(*) AS c FROM users'),
    candidates: count("SELECT COUNT(*) AS c FROM users WHERE role = 'candidate'"),
    employers: count("SELECT COUNT(*) AS c FROM users WHERE role = 'employer'"),
    jobs: count('SELECT COUNT(*) AS c FROM jobs'),
    openJobs: count("SELECT COUNT(*) AS c FROM jobs WHERE status = 'open'"),
    applications: count('SELECT COUNT(*) AS c FROM applications'),
    applicationsByStatus: db
      .prepare('SELECT status, COUNT(*) AS count FROM applications GROUP BY status')
      .all(),
  });
});

router.get('/admin/users', authenticate, requireRole('admin'), (req, res) => {
  const { role, search } = req.query;
  const clauses = [];
  const params = [];
  if (role) {
    clauses.push('role = ?');
    params.push(role);
  }
  if (search) {
    clauses.push('(name LIKE ? OR email LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = getDb()
    .prepare(`SELECT id, name, email, role, created_at FROM users ${where} ORDER BY id ASC`)
    .all(...params);
  res.json(rows.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, createdAt: r.created_at })));
});

router.patch('/admin/users/:id/role', authenticate, requireRole('admin'), (req, res) => {
  const { role } = req.body || {};
  if (!['candidate', 'employer', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'role must be candidate, employer or admin' });
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
  res.json({ id: user.id, role });
});

router.delete('/admin/users/:id', authenticate, requireRole('admin'), (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'You cannot delete yourself' });
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  res.json({ deleted: true, id: user.id });
});

export default router;
