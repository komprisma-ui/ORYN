# ORYN — Intelligent Customer Operations

MVP foundation for an AI-powered omnichannel customer operations platform.

## Modules
- Dashboard
- Customers / Customer 360
- Inbox / Conversations
- Sales pipeline
- Follow-up
- AI assistant foundation
- Automation / event foundation
- Realtime event stream
- Multi-tenant database model
- Role & permission foundation

## Stack
- Next.js + TypeScript
- Fastify + TypeScript
- PostgreSQL + Prisma
- Shared TypeScript contracts

## Local development
1. Copy `.env.example` to `.env`.
2. Run `npm install`.
3. Start PostgreSQL.
4. Run `npm run db:generate && npm run db:deploy`.
5. Optionally run `npm run db:seed` for demo data.
6. Run `npm run dev`.

Use `npm run db:migrate` only when creating a new migration during development. Production and CI should use `npm run db:deploy`.

## Database migration safety
The repository contains a complete baseline migration followed by the automation migration. A fresh PostgreSQL database can be initialized with `npm run db:deploy`.

If an older ORYN database already exists and was created with `prisma db push` or already has the automation migration recorded, **do not run `db:deploy` blindly**. Back up the database first and reconcile its Prisma migration history before deployment; the baseline migration is intended for a fresh database and must not be applied on top of an already-populated schema.

## Production environment
Set a strong `AUTH_SECRET` (at least 32 characters) and configure `WEB_ORIGIN` with the exact allowed web origin(s). Do not use the demo credentials or demo seed data in production. Channel credentials must be supplied through secure provider configuration and are never committed to the repository.

## Validation
CI installs dependencies, generates Prisma Client, applies all migrations against PostgreSQL, runs API typechecking, and builds both web and API packages.

WhatsApp and other channel credentials are intentionally not embedded; production integrations will be connected through secure environment variables / provider accounts.
