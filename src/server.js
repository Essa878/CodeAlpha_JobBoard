import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import authRouter from './routes/auth.js';
import jobsRouter from './routes/jobs.js';
import applicationsRouter from './routes/applications.js';
import candidatesRouter from './routes/candidates.js';
import employersRouter from './routes/employers.js';
import notificationsRouter from './routes/notifications.js';
import adminRouter from './routes/admin.js';
import { initDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());
app.use(express.static(publicDir));

app.use('/api/auth', authRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/candidates', candidatesRouter);
app.use('/api/employers', employersRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api', applicationsRouter);
app.use('/api', adminRouter);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

initDb();

app.listen(PORT, () => {
  console.log(`Job Board running at http://localhost:${PORT}`);
});
