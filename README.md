# Admin Panel

Admin panel for managing the OnlyOne platform.

## Features

- **Dashboard**: Overview of platform stats, earnings, users, and live sessions
- **User Management**: 
  - Approve/reject creator applications
  - Ban/suspend users
  - Search and filter users
  - View user details and stats
- **Reports**: Handle user reports with resolve/dismiss actions
- **Live Sessions**: Monitor active live streaming sessions

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set environment variables (create `.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:4000
```

3. Run the development server:
```bash
npm run dev
```

The admin panel will be available at `http://localhost:3001`

## Authentication

Only users with the `ADMIN` role can access the admin panel. Login using your admin credentials at `/login`.

## API Endpoints

All admin endpoints are prefixed with `/admin` and require ADMIN role:
- `GET /admin/dashboard/stats` - Dashboard statistics
- `GET /admin/users` - List users with filters
- `GET /admin/users/:userId` - Get user details
- `POST /admin/users/:userId/approve-creator` - Approve creator application
- `POST /admin/users/:userId/reject-creator` - Reject creator application
- `POST /admin/users/:userId/ban` - Ban user
- `POST /admin/users/:userId/unban` - Unban user
- `POST /admin/users/:userId/suspend` - Suspend user
- `GET /admin/reports` - List reports
- `POST /admin/reports/:reportId/resolve` - Resolve/dismiss report
- `GET /admin/sessions/live` - Get active live sessions

