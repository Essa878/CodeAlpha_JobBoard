import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate, requireRole } from '../auth.js';

const router = Router();

function employerView(row, openJobs = 0, totalJobs = 0) {
  return {
    id: row.id,
    userId: row.user_id,
    companyName: row.company_name,
    industry: row.industry,
    website: row.website,
    description: row.description,
    openJobs,
    totalJobs,
    updatedAt: row.updated_at,
  };
}

router.get('/me', authenticate, requireRole('employer'), (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM employers WHERE user_id = ?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Employer profile not found' });
  const open = db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE employer_id = ? AND status = 'open'").get(req.user.id).c;
  const total = db.prepare('SELECT COUNT(*) AS c FROM jobs WHERE employer_id = ?').get(req.user.id).c;
  res.json(employerView(row, open, total));
});

router.put('/me', authenticate, requireRole('employer'), (req, res) => {
  const db = getDb();
  const current = db.prepare('SELECT * FROM employers WHERE user_id = ?').get(req.user.id);
  if (!current) return res.status(404).json({ error: 'Employer profile not found' });
  const {
    companyName = current.company_name,
    industry = current.industry,
    website = current.website,
    description = current.description,
  } = req.body || {};
  db.prepare("UPDATE employers SET company_name = ?, industry = ?, website = ?, description = ?, updated_at = datetime('now') WHERE user_id = ?")
    .run(companyName, industry, website, description, req.user.id);
  const row = db.prepare('SELECT * FROM employers WHERE user_id = ?').get(req.user.id);
  res.json(employerView(row));
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM employers WHERE user_id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Employer not found' });
  const jobs = db.prepare('SELECT * FROM jobs WHERE employer_id = ? ORDER BY created_at DESC').all(row.user_id);
  res.json({
    ...employerView(
      row,
      jobs.filter((j) => j.status === 'open').length,
      jobs.length
    ),
    jobs: jobs.map((j) => ({
      id: j.id,
      title: j.title,
      location: j.location,
      jobType: j.job_type,
      status: j.status,
      createdAt: j.created_at,
    })),
  });
});

export default router;
