import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate, requireRole, optionalAuth } from '../auth.js';

const router = Router();
const JOB_TYPES = ['full-time', 'part-time', 'contract', 'internship'];

const BASE_QUERY = `
  SELECT j.*, u.name AS employer_name, e.company_name, e.industry
  FROM jobs j
  JOIN users u ON u.id = j.employer_id
  LEFT JOIN employers e ON e.user_id = j.employer_id
`;

function jobView(row, { applicationCount = 0, application = undefined } = {}) {
  const view = {
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
    industry: row.industry,
    applicantCount: applicationCount,
    createdAt: row.created_at,
  };
  if (application !== undefined) {
    view.hasApplied = !!application;
    view.applicationStatus = application ? application.status : null;
  }
  return view;
}

function countApplicants(jobId) {
  return getDb().prepare('SELECT COUNT(*) AS c FROM applications WHERE job_id = ?').get(jobId).c;
}

function candidateApplications(userId) {
  const map = new Map();
  if (userId == null) return map;
  const rows = getDb()
    .prepare('SELECT job_id, status FROM applications WHERE candidate_id = ?')
    .all(userId);
  rows.forEach((r) => map.set(r.job_id, { status: r.status }));
  return map;
}

router.get('/', optionalAuth, (req, res) => {
  const { search, location, type, category, employerId, salaryMin, sort, status } = req.query;
  const clauses = [];
  const params = [];
  if (search) {
    clauses.push('(j.title LIKE ? OR j.description LIKE ? OR j.category LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
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
  if (salaryMin) {
    clauses.push('(j.salary_max IS NULL OR j.salary_max >= ?)');
    params.push(Number(salaryMin));
  }
  if (status) {
    clauses.push('j.status = ?');
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  let orderBy = 'j.created_at DESC';
  if (sort === 'oldest') orderBy = 'j.created_at ASC';
  else if (sort === 'salary') orderBy = 'j.salary_max IS NULL, j.salary_max DESC';

  const rows = getDb().prepare(`${BASE_QUERY} ${where} ORDER BY ${orderBy}`).all(...params);
  const mine = candidateApplications(req.user?.role === 'candidate' ? req.user.id : null);
  res.json(
    rows.map((row) =>
      jobView(row, {
        applicationCount: countApplicants(row.id),
        application: req.user?.role === 'candidate' ? mine.get(row.id) ?? null : undefined,
      })
    )
  );
});

router.get('/mine', authenticate, requireRole('employer'), (req, res) => {
  const rows = getDb()
    .prepare(`${BASE_QUERY} WHERE j.employer_id = ? ORDER BY j.created_at DESC`)
    .all(req.user.id);
  res.json(rows.map((row) => jobView(row, { applicationCount: countApplicants(row.id) })));
});

router.get('/stats', authenticate, requireRole('employer'), (req, res) => {
  const db = getDb();
  const jobs = db.prepare('SELECT id, status FROM jobs WHERE employer_id = ?').all(req.user.id);
  const ids = jobs.map((j) => j.id);
  let totalApplications = 0;
  let hires = 0;
  let shortlisted = 0;
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    totalApplications = db
      .prepare(`SELECT COUNT(*) AS c FROM applications WHERE job_id IN (${ph})`)
      .get(...ids).c;
    hires = db
      .prepare(`SELECT COUNT(*) AS c FROM applications WHERE job_id IN (${ph}) AND status = 'hired'`)
      .get(...ids).c;
    shortlisted = db
      .prepare(`SELECT COUNT(*) AS c FROM applications WHERE job_id IN (${ph}) AND status = 'shortlisted'`)
      .get(...ids).c;
  }
  res.json({
    totalJobs: jobs.length,
    openJobs: jobs.filter((j) => j.status === 'open').length,
    closedJobs: jobs.filter((j) => j.status === 'closed').length,
    totalApplications,
    shortlisted,
    hires,
  });
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

router.get('/:id', optionalAuth, (req, res) => {
  const row = getDb().prepare(`${BASE_QUERY} WHERE j.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Job not found' });
  let application;
  if (req.user?.role === 'candidate') {
    application = getDb()
      .prepare('SELECT id, status FROM applications WHERE job_id = ? AND candidate_id = ?')
      .get(row.id, req.user.id) ?? null;
  }
  res.json(jobView(row, { applicationCount: countApplicants(row.id), application }));
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
