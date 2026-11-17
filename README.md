# Cabeceiras de Luxo — Orçamentos

The production entry point is `index.html`. The previous duplicate HTML pages are retired.

## Shared history

The browser calls `/api/cloud`. Vercel validates the team password and issues a signed, HttpOnly, Secure, SameSite session cookie lasting 30 days. Passwords and session secrets are environment variables, never frontend code. The server forwards authorized operations to the `budget-store` Supabase Edge Function with a separate private token. That function uses its built-in server service key; direct database access by anon/authenticated roles is revoked and RLS is enabled. Login attempts are limited to 15 per IP per 15 minutes by a database function.

Vercel environment variables: `APP_PASSWORD`, `SESSION_SECRET`, `STORE_TOKEN`, `STORE_URL`. To change the shared password, update `APP_PASSWORD`, rotate `SESSION_SECRET` to invalidate existing sessions, and redeploy. The edge source stores only SHA-256 of the random `STORE_TOKEN`; rotate both sides together.

New budgets appear only after the server confirms the write. Edits preserve commercial status. The history refreshes on tab opening and window focus. Local historical budgets can be imported from the original browser without overwriting existing records; local copies remain intact. The server reads every page of history rather than stopping at the default row limit.

## Validation

Checked syntax, login and wrong password, tampered cookies, cross-origin mutations, logout, unauthorized database API access, create and fresh read, edit preserving status, import without overwrite, status validation, and delete. Temporary test records are removed after validation.

## Database

Schema managed by the `shared_history` migration in the connected Supabase project. No browser grants or public policies are needed: only the authenticated server bridge can access shared customer records.
