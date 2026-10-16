import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { getDb } from '../db.js';
import { authenticate, requireRole } from '../auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = new Set(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `resume_${req.user.id}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) return cb(new Error('Only PDF or Word documents are allowed'));
    return cb(null, true);
  },
});

const router = Router();

function profileView(row) {
  return {
    id: row.id,
    userId: row.user_id,
    headline: row.headline,
    skills: row.skills,
    resumeName: row.resume_name,
    resumeUrl: row.resume_path ? `/api/candidates/${row.user_id}/resume` : null,
    updatedAt: row.updated_at,
  };
}

router.get('/me', authenticate, requireRole('candidate'), (req, res) => {
  const row = getDb().prepare('SELECT * FROM candidates WHERE user_id = ?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Candidate profile not found' });
  res.json(profileView(row));
});

router.put('/me', authenticate, requireRole('candidate'), (req, res) => {
  const db = getDb();
  const current = db.prepare('SELECT * FROM candidates WHERE user_id = ?').get(req.user.id);
  if (!current) return res.status(404).json({ error: 'Candidate profile not found' });
  const { headline = current.headline, skills = current.skills } = req.body || {};
  db.prepare("UPDATE candidates SET headline = ?, skills = ?, updated_at = datetime('now') WHERE user_id = ?")
    .run(headline, skills, req.user.id);
  res.json(profileView(db.prepare('SELECT * FROM candidates WHERE user_id = ?').get(req.user.id)));
});

router.post('/me/resume', authenticate, requireRole('candidate'), (req, res) => {
  upload.single('resume')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name must be "resume")' });
    const db = getDb();
    const previous = db.prepare('SELECT resume_path FROM candidates WHERE user_id = ?').get(req.user.id);
    if (previous && previous.resume_path && previous.resume_path !== req.file.path) {
      fs.rm(previous.resume_path, { force: true }, () => {});
    }
    db.prepare("UPDATE candidates SET resume_path = ?, resume_name = ?, updated_at = datetime('now') WHERE user_id = ?")
      .run(req.file.path, req.file.originalname, req.user.id);
    return res.status(201).json({
      resumeName: req.file.originalname,
      size: req.file.size,
      resumeUrl: `/api/candidates/${req.user.id}/resume`,
    });
  });
});

router.get('/:id/resume', authenticate, (req, res) => {
  const row = getDb().prepare('SELECT resume_path, resume_name FROM candidates WHERE user_id = ?').get(req.params.id);
  if (!row || !row.resume_path || !fs.existsSync(row.resume_path)) {
    return res.status(404).json({ error: 'Resume not found' });
  }
  return res.download(row.resume_path, row.resume_name || 'resume');
});

export default router;
