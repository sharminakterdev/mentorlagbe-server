# MentorLagbe Server

This is the Express.js and MongoDB backend for **MentorLagbe**, a role-based online and home tuition marketplace.

The API manages authentication, JWT authorization, public tuition discovery, student applications, tutor tuition management, admin moderation, profile updates, image uploads, and Stripe Pro-plan payments.

## Live API

- Live server URL: **Add the deployed server URL here**
- Health endpoint: `/api/health`

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@mentorlagbe.com` | `Mentor@123` |
| Tutor | `tutor@mentorlagbe.com` | `Mentor@123` |
| Student | `student@mentorlagbe.com` | `Mentor@123` |

Demo data and accounts are created automatically when the database is first initialized. Change these credentials before a public production deployment.

## Tech stack

- Node.js
- Express.js 5
- MongoDB Node.js driver
- JSON Web Tokens
- bcryptjs
- Axios
- Stripe
- Multer
- CORS
- dotenv

## Database

The server uses the `mentorlagbe` MongoDB database and exactly four application collections:

| Collection | Purpose |
| --- | --- |
| `users` | Accounts, roles, profiles, and subscription plans |
| `tuitions` | Tutor tuition posts and admin approval state |
| `applications` | Student tuition applications |
| `payments` | Stripe subscription transactions |

On first startup, the server creates demo users and 12 approved tuition listings when the related collections are empty.

## Environment setup

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Configure the following variables:

```env
PORT=5000
CLIENT_URL=http://localhost:3000
MONGODB_URI=mongodb+srv://username:password@cluster/mentorlagbe
JWT_SECRET=replace-with-a-long-random-secret
IMGBB_API_KEY=your-imgbb-api-key
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
```

| Variable | Purpose |
| --- | --- |
| `PORT` | Express server port |
| `CLIENT_URL` | Allowed frontend origin and Stripe redirect base URL |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Signing and verification secret for bearer tokens |
| `IMGBB_API_KEY` | ImgBB image-upload API key |
| `STRIPE_SECRET_KEY` | Stripe API secret key |
| `STRIPE_WEBHOOK_SECRET` | Reserved Stripe webhook signing secret |

Never commit `.env`, database credentials, JWT secrets, Stripe keys, or ImgBB keys to source control.

## Local installation

Install dependencies:

```bash
npm install
```

Start with Node watch mode:

```bash
npm run dev
```

Start normally:

```bash
npm start
```

The API listens on `http://localhost:5000` by default.

## Authentication

Protected routes require a JWT bearer token:

```http
Authorization: Bearer <token>
```

The server provides these custom middleware guards:

- `verifyToken` validates JWT authentication.
- `verifyStudent` requires a `student` role.
- `verifyTutor` requires a `tutor` role.
- `verifyAdmin` requires an `admin` role.

Tokens are valid for seven days.

## API routes

### Health

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | API and database status |

### Authentication

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/sign-up` | Public | Register a student or tutor |
| `POST` | `/api/auth/sign-in` | Public | Login and receive a JWT |
| `GET` | `/api/me` | Authenticated | Get the current authenticated user |

### Tuitions

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/tuitions` | Public | Search, filter, and paginate approved active tuitions |
| `GET` | `/api/tuitions/:id` | Public | Get tuition details and tutor information |
| `POST` | `/api/tuitions` | Tutor | Create a pending tuition |
| `GET` | `/api/dashboard/tutor/tuitions` | Tutor | List the tutor's tuition posts |
| `PATCH` | `/api/tuitions/:id` | Tutor/Admin | Update, activate, or moderate a tuition |
| `DELETE` | `/api/tuitions/:id` | Tutor/Admin | Delete a tuition and linked applications |

The public tuition route accepts these query parameters:

```text
search=title-or-subject
subject=Mathematics
classLevel=Class 10
mode=Online
page=1
limit=12
```

Free tutors may create up to two tuition posts. Pro tutors do not have this posting limit.

### Applications

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/api/applications` | Student | Submit an application once |
| `GET` | `/api/dashboard/student/applications` | Student | List the student's applications |
| `DELETE` | `/api/applications/:id` | Student | Cancel a pending application |
| `GET` | `/api/dashboard/tutor/applicants` | Tutor | List applicants for tutor posts |
| `PATCH` | `/api/applications/:id/status` | Tutor | Accept or reject an application |

### Dashboard statistics

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/dashboard/stats` | Authenticated | Role-specific dashboard statistics |

### Profile and uploads

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `PATCH` | `/api/profile` | Authenticated | Update name, phone, bio, or image |
| `POST` | `/api/upload/image` | Authenticated | Upload a base64 image through ImgBB |

The image upload body accepts:

```json
{
  "image": "base64-image-data",
  "name": "optional-image-name"
}
```

### Stripe payments

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `POST` | `/api/stripe/create-checkout` | Authenticated | Create a Tutor or Student Pro checkout |
| `POST` | `/api/stripe/verify` | Authenticated | Verify a completed Stripe checkout |

Successful checkout verification:

- Updates the user's plan to `pro`
- Creates or updates a payment record
- Stores transaction and Stripe session identifiers

Tutor Pro pricing is `$15` and Student Pro pricing is `$10`.

### Admin

| Method | Endpoint | Access | Description |
| --- | --- | --- | --- |
| `GET` | `/api/admin/users` | Admin | List all users |
| `PATCH` | `/api/admin/users/:id/role` | Admin | Change a user's role |
| `GET` | `/api/admin/tuitions` | Admin | List every tuition |
| `GET` | `/api/admin/transactions` | Admin | List all payment records |

## Role permissions

| Capability | Student | Tutor | Admin |
| --- | :---: | :---: | :---: |
| Browse and view tuitions | Yes | Yes | Yes |
| Apply for tuition | Yes | No | No |
| Cancel pending application | Yes | No | No |
| Post tuition | No | Yes | No |
| Manage own tuition | No | Yes | No |
| Manage applicants | No | Yes | No |
| Approve or reject tuitions | No | No | Yes |
| Manage roles | No | No | Yes |
| View transactions | No | No | Yes |

## CORS and production

Set `CLIENT_URL` to the exact deployed frontend origin, for example:

```env
CLIENT_URL=https://mentorlagbe.vercel.app
```

For production:

- Use a long, unique `JWT_SECRET`.
- Use MongoDB Atlas or a managed MongoDB cluster.
- Enable HTTPS.
- Configure Stripe success and cancel URLs for the production frontend.
- Restrict CORS to the deployed client origin.
- Add a real Stripe webhook endpoint for server-side payment events.
- Keep all credentials in environment variables.

## Testing

The package currently provides a readiness check:

```bash
npm test
```
