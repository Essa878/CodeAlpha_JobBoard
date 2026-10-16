# CodeAlpha_JobBoard

A Job Board Platform built with **Express.js** and **SQLite** for the CodeAlpha Backend Development internship.

Employers post jobs and manage applicants; candidates build a profile, upload a resume, search jobs, and track applications. Includes notifications and reporting/admin features.

## Features

- Role-based accounts: **candidate**, **employer**, and **admin**
- JWT authentication with bcrypt-hashed passwords
- Job listings with search filters (keyword, location, type, category, employer)
- Employers post, update, and close/delete their listings
- Candidates apply with a cover letter and withdraw applications
- Resume upload (PDF/Word, max 5 MB) and download
- Application status workflow: `applied → reviewing → shortlisted → rejected → hired`
- In-app notifications on new applications and status changes
- Employer reporting (applications per job, by status)
- Admin: platform statistics and user management

## Tech Stack

- Node.js + Express 5
- SQLite via `better-sqlite3`
- `bcryptjs`, `jsonwebtoken`
- `multer` for resume uploads
- `dotenv`

## Getting Started

```bash
npm install
cp .env.example .env          # optional; defaults work
npm run seed:admin            # creates an admin account (optional)
npm start
```

Open <http://localhost:3002>. For auto-reload: `npm run dev`.

Default admin (after `seed:admin`): `admin@jobboard.local` / `admin1234`.

## Data Model

- **users** — id, name, email (unique), password_hash, role
- **candidates** — user_id, headline, skills, resume_path, resume_name
- **employers** — user_id, company_name, industry, website, description
- **jobs** — employer_id, title, description, location, job_type, category, salary_min/max, status
- **applications** — job_id, candidate_id, cover_letter, status, unique(job_id, candidate_id)
- **notifications** — user_id, type, message, job_id, application_id, is_read

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account (`role`: candidate/employer) |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Current user |

### Jobs
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/jobs?search=&location=&type=&category=&employerId=` | Search jobs |
| GET | `/api/jobs/:id` | Job details |
| GET | `/api/jobs/mine` | My listings (employer) |
| POST | `/api/jobs` | Create listing (employer) |
| PUT | `/api/jobs/:id` | Update listing (owner) |
| DELETE | `/api/jobs/:id` | Delete listing (owner) |
| GET | `/api/jobs/:id/applications` | View applicants (owner) |

### Candidates
| Method | Path | Description |
|--------|------|-------------|
| GET/PUT | `/api/candidates/me` | View/update profile |
| POST | `/api/candidates/me/resume` | Upload resume (field: `resume`) |
| GET | `/api/candidates/:id/resume` | Download resume (auth) |

### Applications
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/jobs/:id/apply` | Apply to a job (candidate) |
| GET | `/api/applications/me` | My applications (candidate) |
| PATCH | `/api/applications/:id/status` | Update status (employer owner) |
| DELETE | `/api/applications/:id` | Withdraw application (candidate) |

### Notifications, Reports & Admin
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications` | My notifications + unread count |
| POST | `/api/notifications/read-all` | Mark all read |
| POST | `/api/notifications/:id/read` | Mark one read |
| GET | `/api/reports/employer` | Application stats per job (employer) |
| GET | `/api/admin/stats` | Platform statistics (admin) |
| GET | `/api/admin/users` | List users (admin) |
| PATCH | `/api/admin/users/:id/role` | Change role (admin) |
| DELETE | `/api/admin/users/:id` | Delete user (admin) |

### Employers
| Method | Path | Description |
|--------|------|-------------|
| GET/PUT | `/api/employers/me` | View/update company profile |
| GET | `/api/employers/:id` | Public company profile + jobs |

## Example Flow

```bash
# Register an employer and post a job
curl -X POST http://localhost:3002/api/auth/register -H "Content-Type: application/json" \
  -d '{"name":"Acme","email":"hr@acme.com","password":"secret1","role":"employer","companyName":"Acme Inc"}'
curl -X POST http://localhost:3002/api/jobs -H "Content-Type: application/json" \
  -H "Authorization: Bearer <EMPLOYER_TOKEN>" \
  -d '{"title":"Backend Developer","location":"Remote","jobType":"full-time","category":"Engineering"}'

# Candidate uploads a resume and applies
curl -X POST http://localhost:3002/api/candidates/me/resume -H "Authorization: Bearer <CANDIDATE_TOKEN>" -F "resume=@resume.pdf"
curl -X POST http://localhost:3002/api/jobs/1/apply -H "Content-Type: application/json" \
  -H "Authorization: Bearer <CANDIDATE_TOKEN>" -d '{"coverLetter":"I am interested."}'
```

## Project Structure

```
CodeAlpha_JobBoard/
├── public/index.html        # optional frontend
├── src/
│   ├── auth.js              # auth + notification helpers
│   ├── db.js                # SQLite schema
│   ├── server.js            # Express entry point
│   ├── seed-admin.js        # create/promote admin
│   └── routes/
│       ├── auth.js
│       ├── jobs.js
│       ├── applications.js
│       ├── candidates.js
│       ├── employers.js
│       ├── notifications.js
│       └── admin.js
├── .env.example
└── package.json
```

## License

MIT
