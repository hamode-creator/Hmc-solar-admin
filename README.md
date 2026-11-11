# HMC Solar — Independent Admin Dashboard

A standalone React + Node.js dashboard for HMC Solar. The app does not use Base44
or Higgsfield at runtime. Its only backend dependency is Supabase.

## Functions
- Private login through existing Supabase Auth
- HMC-admin-only access (verified by Supabase Edge Function, not by browser)
- Inventory pagination, search, create, edit, delete, and quick sale
- Bulk update/delete with typed confirmation
- CSV/XLSX import, CSV/JSON backup, audit log
- Optional BarcodeDetector browser scanning
- Local HMC logo and icon assets

## Deploy to Render
1. Create a PRIVATE GitHub repository for the code.
2. Upload all files from this folder (render.yaml must be at repository root).
3. Connect the repository to your Render workspace using the Blueprint flow.
4. Render creates one free web service in Frankfurt, using Node 22.
5. Verify /health, /api/admin, and administrator login before using with real sales.

The Render service uses:
- Build: cd app && npm install && npm run build
- Start: cd app && node render-server.mjs
- Health check: /health
- Source: app/
- Runtime: Node.js 22

The Supabase publishable key in code is public by design, while the service-role key is NEVER
bundled into the frontend or stored on Render. Supabase enforces the real admin permission.

## Security
- Change any Supabase password ever shared in chat.
- Never store credentials in GitHub source.
- The server does not include public signup.
- The browser's session is only stored in its current tab/session.
- The legacy Base44 website may stay online as a temporary fallback, but inventory writes
  through the new dashboard go to Supabase.
- Android Play Integrity is not yet production-ready, iOS App Attest is not enabled.
