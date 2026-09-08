# ORYN — Intelligent Customer Operations

MVP foundation for an AI-powered omnichannel customer operations platform.

## Modules
- Dashboard
- Customers / Customer 360
- Inbox / Conversations
- Sales pipeline
- Follow-up
- AI assistant foundation
- Multi-tenant database model
- Role & permission foundation

## Stack
- Next.js + TypeScript
- Fastify + TypeScript
- PostgreSQL + Prisma
- Shared TypeScript contracts

## Start
1. Copy `.env.example` to `.env`.
2. Run `npm install`.
3. Start PostgreSQL.
4. Run `npm run db:generate && npm run db:push`.
5. Run `npm run dev`.

WhatsApp and other channel credentials are intentionally not embedded; production integrations will be connected through secure environment variables / provider accounts.
