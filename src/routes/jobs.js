import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate, requireRole } from '../auth.js';

const router = Router();
const JOB_TYPES = ['full-time', 'part-time', 'contract', 'internship'];

const BASE_QUERY = `
  SELECT j.*, u.name AS employer_name, e.company_name
  FROM jobs j
  JOIN users u ON u.id = j.employer_id
  LEFT JOIN employers e ON e.user_id = j.employer_id
`;

function jobView(row, { applicationCount = 0 } = {}) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    jobType: row.job_type,
    category: row.category,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    status: row.status,
    employerId: row.employer_id,
    employerName: row.employer_name,
    companyName: row.company_name,
    applicantCount: applicationCount,
    createdAt: row.created_at,
  };
}

function countApplicants(jobId) {
  return getDb().prepare('SELECT COUNT(*) AS c FROM applications WHERE job_id = ?').get(jobId).c;
}

router.get('/', (req, res) => {
  const { search, location, type, category, employerId } = req.query;
  const clauses = [];
  const params = [];
  if (search) {
    clauses.push('(j.title LIKE ? OR j.description LIKE ? OR j.category LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (location) {
    clauses.push('j.location LIKE ?');
    params.push(`%${location}%`);
  }
  if (type) {
    clauses.push('j.job_type = ?');
    params.push(type);
  }
  if (category) {
    clauses.push('j.category LIKE ?');
    params.push(`%${category}%`);
  }
  if (employerId) {
    clauses.push('j.employer_id = ?');
    params.push(Number(employerId));
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = getDb().prepare(`${BASE_QUERY} ${where} ORDER BY j.created_at DESC`).all(...params);
  res.json(rows.map((row) => jobView(row, { applicationCount: countApplicants(row.id) })));
});

router.get('/mine', authenticate, requireRole('employer'), (req, res) => {
  const rows = getDb()
    .prepare(`${BASE_QUERY} WHERE j.employer_id = ? ORDER BY j.created_at DESC`)
    .all(req.user.id);
  res.json(rows.map((row) => jobView(row, { applicationCount: countApplicants(row.id) })));
});

router.get('/:id/applications', authenticate, requireRole('employer'), (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.employer_id !== req.user.id) return res.status(403).json({ error: 'Not your job listing' });

  const rows = db
    .prepare(
      `SELECT a.id, a.cover_letter, a.status, a.created_at, a.updated_at,
              u.id AS candidate_id, u.name, u.email,
              c.headline, c.skills, c.resume_name, c.resume_path
       FROM applications a
       JOIN users u ON u.id = a.candidate_id
       LEFT JOIN candidates c ON c.user_id = a.candidate_id
       WHERE a.job_id = ? ORDER BY a.created_at DESC`
    )
    .all(job.id);

  res.json(
    rows.map((r) => ({
      id: r.id,
      coverLetter: r.cover_letter,
      status: r.status,
      appliedAt: r.created_at,
      updatedAt: r.updated_at,
      candidate: {
        id: r.candidate_id,
        name: r.name,
        email: r.email,
        headline: r.headline,
        skills: r.skills,
        resumeName: r.resume_name,
        resumeUrl: r.resume_path ? `/api/candidates/${r.candidate_id}/resume` : null,
      },
    }))
  );
});

router.get('/:id', (req, res) => {
  const row = getDb().prepare(`${BASE_QUERY} WHERE j.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Job not found' });
  res.json(jobView(row, { applicationCount: countApplicants(row.id) }));
});

router.post('/', authenticate, requireRole('employer'), (req, res, next) => {
  try {
    const { title, description = '', location = '', jobType = 'full-time', category = '', salaryMin = null, salaryMax = null } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    if (!JOB_TYPES.includes(jobType)) return res.status(400).json({ error: `jobType must be one of ${JOB_TYPES.join(', ')}` });
    const db = getDb();
    const info = db
      .prepare(
        `INSERT INTO jobs (employer_id, title, description, location, job_type, category, salary_min, salary_max)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(req.user.id, title, description, location, jobType, category, salaryMin, salaryMax);
    const row = db.prepare(`${BASE_QUERY} WHERE j.id = ?`).get(info.lastInsertRowid);
    res.status(201).json(jobView(row));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', authenticate, requireRole('employer'), (req, res, next) => {
  try {
    const db = getDb();
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.employer_id !== req.user.id) return res.status(403).json({ error: 'Not your job listing' });

    const {
      title = job.title,
      description = job.description,
      location = job.location,
      jobType = job.job_type,
      category = job.category,
      salaryMin = job.salary_min,
      salaryMax = job.salary_max,
      status = job.status,
    } = req.body;
    if (!JOB_TYPES.includes(jobType)) return res.status(400).json({ error: `jobType must be one of ${JOB_TYPES.join(', ')}` });
    if (!['open', 'closed'].includes(status)) return res.status(400).json({ error: 'status must be open or closed' });

    db.prepare(
      `UPDATE jobs SET title=?, description=?, location=?, job_type=?, category=?, salary_min=?, salary_max=?, status=? WHERE id=?`
    ).run(title, description, location, jobType, category, salaryMin, salaryMax, status, job.id);
    const row = db.prepare(`${BASE_QUERY} WHERE j.id = ?`).get(job.id);
    return res.json(jobView(row, { applicationCount: countApplicants(job.id) }));
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', authenticate, requireRole('employer'), (req, res) => {
  const db = getDb();
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.employer_id !== req.user.id) return res.status(403).json({ error: 'Not your job listing' });
  db.prepare('DELETE FROM jobs WHERE id = ?').run(job.id);
  res.json({ deleted: true, id: job.id });
});

export default router;
