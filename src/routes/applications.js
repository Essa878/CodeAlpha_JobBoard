import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate, requireRole, createNotification } from '../auth.js';

const router = Router();
const APPLICATION_STATUSES = ['applied', 'reviewing', 'shortlisted', 'rejected', 'hired'];

router.post('/jobs/:id/apply', authenticate, requireRole('candidate'), (req, res, next) => {
  try {
    const db = getDb();
    const { coverLetter = '' } = req.body || {};
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.status !== 'open') return res.status(409).json({ error: 'This job is no longer accepting applications' });

    const existing = db
      .prepare('SELECT id FROM applications WHERE job_id = ? AND candidate_id = ?')
      .get(job.id, req.user.id);
    if (existing) return res.status(409).json({ error: 'You have already applied to this job' });

    const info = db
      .prepare('INSERT INTO applications (job_id, candidate_id, cover_letter) VALUES (?, ?, ?)')
      .run(job.id, req.user.id, coverLetter);

    const me = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id);
    createNotification(job.employer_id, 'new_application', `${me.name} applied to "${job.title}"`, {
      jobId: job.id,
      applicationId: info.lastInsertRowid,
    });

    const row = db
      .prepare(
        `SELECT a.*, j.title, j.location, j.employer_id FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ?`
      )
      .get(info.lastInsertRowid);
    res.status(201).json({
      id: row.id,
      status: row.status,
      coverLetter: row.cover_letter,
      appliedAt: row.created_at,
      job: { id: row.job_id, title: row.title, location: row.location },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/applications/me', authenticate, requireRole('candidate'), (req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT a.*, j.title, j.location, j.employer_id, e.company_name
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       LEFT JOIN employers e ON e.user_id = j.employer_id
       WHERE a.candidate_id = ? ORDER BY a.created_at DESC`
    )
    .all(req.user.id);
  res.json(
    rows.map((r) => ({
      id: r.id,
      status: r.status,
      coverLetter: r.cover_letter,
      appliedAt: r.created_at,
      updatedAt: r.updated_at,
      job: { id: r.job_id, title: r.title, location: r.location, companyName: r.company_name },
    }))
  );
});

router.patch('/applications/:id/status', authenticate, requireRole('employer'), (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!APPLICATION_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of ${APPLICATION_STATUSES.join(', ')}` });
    }
    const db = getDb();
    const app = db
      .prepare(`SELECT a.*, j.employer_id, j.title FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ?`)
      .get(req.params.id);
    if (!app) return res.status(404).json({ error: 'Application not found' });
    if (app.employer_id !== req.user.id) return res.status(403).json({ error: 'Not your job listing' });

    db.prepare("UPDATE applications SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, app.id);
    createNotification(app.candidate_id, 'application_status', `Your application for "${app.title}" is now "${status}"`, {
      jobId: app.job_id,
      applicationId: app.id,
    });
    return res.json({ id: app.id, status });
  } catch (err) {
    return next(err);
  }
});

router.delete('/applications/:id', authenticate, requireRole('candidate'), (req, res) => {
  const db = getDb();
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found' });
  if (app.candidate_id !== req.user.id) return res.status(403).json({ error: 'Not your application' });
  db.prepare('DELETE FROM applications WHERE id = ?').run(app.id);
  res.json({ withdrawn: true, id: app.id });
});

export default router;
