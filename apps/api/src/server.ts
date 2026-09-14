import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { z } from 'zod';
import { prisma } from './lib/prisma.js';
import { authUser, createSession, tenantContext, verifyPassword } from './lib/auth.js';
import { buildLeadInsights } from './modules/ai/insights.js';
import { initializeAutomationOrchestrator } from './modules/automation/orchestrator.js';
import { registerEventRoutes } from './modules/events/routes.js';

const app = Fastify({ logger: true, requestIdHeader: 'x-request-id' });
const isProduction = process.env.NODE_ENV === 'production';
const origins = (process.env.WEB_ORIGIN ?? '').split(',').map(v => v.trim()).filter(Boolean);
if (isProduction && origins.length === 0) throw new Error('WEB_ORIGIN must be configured in production');
await app.register(cors, { origin: origins.length ? origins : true });
await app.register(helmet);
await app.register(sensible);

const idParam = z.object({ id: z.string().min(1).max(128) });
const customerStatus = z.enum(['NEW','ACTIVE','HOT_LEAD','WARM_LEAD','COLD_LEAD','CUSTOMER','VIP','INACTIVE','LOST']);
const leadStage = z.enum(['NEW','CONTACTED','INTERESTED','QUALIFIED','OFFER','NEGOTIATION','WON','LOST']);
const taskStatus = z.enum(['TODO','IN_PROGRESS','DONE','CANCELED']);
const customerCreate = z.object({ name: z.string().trim().min(1).max(160), phone: z.string().trim().max(40).optional(), email: z.string().email().optional(), source: z.string().trim().max(80).optional(), status: customerStatus.optional(), leadScore: z.number().int().min(0).max(100).optional(), notes: z.string().max(5000).optional(), assignedToId: z.string().min(1).max(128).nullable().optional() });
const customerUpdate = customerCreate.partial();
const messageCreate = z.object({ content: z.string().trim().min(1).max(10000), contentType: z.string().max(40).default('text'), direction: z.enum(['INBOUND','OUTBOUND']).default('OUTBOUND'), senderType: z.string().max(40).default('user'), aiGenerated: z.boolean().default(false) });
const conversationUpdate = z.object({ status: z.enum(['OPEN','PENDING','CLOSED']).optional(), priority: z.number().int().min(0).max(100).optional(), subject: z.string().max(200).nullable().optional() }).refine(v => Object.keys(v).length > 0, 'At least one field is required');
const taskUpdate = z.object({ status: taskStatus.optional(), priority: z.number().int().min(0).max(100).optional(), dueAt: z.string().datetime().nullable().optional(), title: z.string().trim().min(1).max(240).optional() }).refine(v => Object.keys(v).length > 0, 'At least one field is required');
const taskCreate = z.object({ customerId: z.string().min(1).max(128).nullable().optional(), assigneeId: z.string().min(1).max(128).nullable().optional(), title: z.string().trim().min(1).max(240), dueAt: z.string().datetime().nullable().optional(), priority: z.number().int().min(0).max(100).default(0), source: z.string().trim().max(80).optional() });
const leadCreate = z.object({ customerId: z.string().min(1).max(128), stage: leadStage.default('NEW'), value: z.coerce.number().nonnegative().optional(), probability: z.number().int().min(0).max(100).optional(), ownerId: z.string().min(1).max(128).nullable().optional() });
const leadUpdate = leadCreate.partial().refine(v => Object.keys(v).length > 0, 'At least one field is required');
const tagInput = z.object({ name: z.string().trim().min(1).max(60), color: z.string().trim().max(20).optional() });
const loginInput = z.object({ organizationId: z.string().min(1).max(128), email: z.string().email(), password: z.string().min(8).max(200) });

app.addHook('onRequest', async (request, reply) => {
  if (request.url === '/health' || request.url === '/api/v1/auth/login') return;
  try { authUser(request); } catch { return reply.code(401).send({ error: 'UNAUTHENTICATED' }); }
});

app.get('/health', async () => ({ ok: true, service: 'oryn-api', version: '0.6.0', time: new Date().toISOString() }));

app.post('/api/v1/auth/login', async (request, reply) => {
  const body = loginInput.parse(request.body);
  const user = await prisma.user.findFirst({ where: { organizationId: body.organizationId, email: body.email }, select: { id: true, organizationId: true, role: true, email: true, passwordHash: true } });
  if (!user?.passwordHash || !verifyPassword(body.password, user.passwordHash)) return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
  return { data: { token: createSession({ id: user.id, organizationId: user.organizationId, role: user.role, email: user.email }) } };
});

app.get('/api/v1/auth/me', async request => {
  const user = authUser(request);
  return { data: await prisma.user.findFirst({ where: { id: user.id, organizationId: user.organizationId }, select: { id: true, name: true, email: true, role: true, organizationId: true } }) };
});

app.get('/api/v1/dashboard', async request => {
  const { organizationId } = tenantContext(request);
  const [customers, conversations, followUps, activeLeads, openChats, hotLeadsNeedingFollowUp] = await Promise.all([
    prisma.customer.count({ where: { organizationId } }),
    prisma.conversation.count({ where: { organizationId } }),
    prisma.task.count({ where: { organizationId, status: { in: ['TODO','IN_PROGRESS'] } } }),
    prisma.lead.count({ where: { organizationId, stage: { notIn: ['WON','LOST'] } } }),
    prisma.conversation.count({ where: { organizationId, status: 'OPEN' } }),
    prisma.customer.count({ where: { organizationId, status: { in: ['HOT_LEAD','VIP'] }, leadScore: { gte: 70 } } }),
  ]);
  return { data: { customers, conversations, followUps, activeLeads, openChats, hotLeadsNeedingFollowUp } };
});

app.get('/api/v1/ai/insights', async request => {
  const { organizationId } = tenantContext(request);
  return { data: await buildLeadInsights(organizationId) };
});

app.get('/api/v1/customers', async request => {
  const { organizationId } = tenantContext(request);
  const query = request.query as { limit?: string; search?: string };
  const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 100);
  const search = query.search?.trim();
  const rows = await prisma.customer.findMany({ where: { organizationId, ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } : {}) }, orderBy: { updatedAt: 'desc' }, take: limit });
  return { data: rows };
});

app.post('/api/v1/customers', async request => {
  const { organizationId } = tenantContext(request);
  const body = customerCreate.parse(request.body);
  if (body.assignedToId) { const assignee = await prisma.user.findFirst({ where: { id: body.assignedToId, organizationId }, select: { id: true } }); if (!assignee) return { error: 'ASSIGNEE_NOT_FOUND' }; }
  return { data: await prisma.customer.create({ data: { organizationId, ...body } }) };
});

app.get('/api/v1/customers/:id', async request => {
  const { organizationId } = tenantContext(request); const { id } = idParam.parse(request.params);
  const customer = await prisma.customer.findFirst({ where: { id, organizationId }, include: { tags: { include: { tag: true } }, conversations: { orderBy: { updatedAt: 'desc' }, take: 20 }, leads: { orderBy: { updatedAt: 'desc' }, take: 20 }, tasks: { orderBy: { updatedAt: 'desc' }, take: 20 } } });
  if (!customer) return { error: 'CUSTOMER_NOT_FOUND' }; return { data: customer };
});

app.patch('/api/v1/customers/:id', async request => {
  const { organizationId } = tenantContext(request); const { id } = idParam.parse(request.params); const body = customerUpdate.parse(request.body);
  if (body.assignedToId) { const assignee = await prisma.user.findFirst({ where: { id: body.assignedToId, organizationId }, select: { id: true } }); if (!assignee) return { error: 'ASSIGNEE_NOT_FOUND' }; }
  const result = await prisma.customer.updateMany({ where: { id, organizationId }, data: body }); if (!result.count) return { error: 'CUSTOMER_NOT_FOUND' };
  return { data: await prisma.customer.findFirst({ where: { id, organizationId } }) };
});

app.post('/api/v1/customers/:id/tags', async request => {
  const { organizationId } = tenantContext(request); const { id } = idParam.parse(request.params); const body = tagInput.parse(request.body);
  const customer = await prisma.customer.findFirst({ where: { id, organizationId }, select: { id: true } }); if (!customer) return { error: 'CUSTOMER_NOT_FOUND' };
  const tag = await prisma.tag.upsert({ where: { organizationId_name: { organizationId, name: body.name } }, create: { organizationId, name: body.name, color: body.color }, update: { color: body.color } });
  await prisma.customerTag.upsert({ where: { customerId_tagId: { customerId: id, tagId: tag.id } }, create: { customerId: id, tagId: tag.id }, update: {} }); return { data: tag };
});

app.delete('/api/v1/customers/:id/tags/:tagId', async request => {
  const { organizationId } = tenantContext(request); const { id, tagId } = z.object({ id: z.string(), tagId: z.string() }).parse(request.params);
  const customer = await prisma.customer.findFirst({ where: { id, organizationId }, select: { id: true } }); if (!customer) return { error: 'CUSTOMER_NOT_FOUND' };
  const tag = await prisma.tag.findFirst({ where: { id: tagId, organizationId }, select: { id: true } }); if (!tag) return { error: 'TAG_NOT_FOUND' };
  await prisma.customerTag.deleteMany({ where: { customerId: id, tagId: tag.id } }); return { data: { ok: true } };
});

app.get('/api/v1/leads', async request => {
  const { organizationId } = tenantContext(request); const query = request.query as { limit?: string }; const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 100);
  return { data: await prisma.lead.findMany({ where: { organizationId }, include: { customer: true, owner: { select: { name: true } } }, orderBy: { updatedAt: 'desc' }, take: limit }) };
});

app.post('/api/v1/leads', async request => {
  const { organizationId } = tenantContext(request); const body = leadCreate.parse(request.body);
  const customer = await prisma.customer.findFirst({ where: { id: body.customerId, organizationId }, select: { id: true } }); if (!customer) return { error: 'CUSTOMER_NOT_FOUND' };
  if (body.ownerId) { const owner = await prisma.user.findFirst({ where: { id: body.ownerId, organizationId }, select: { id: true } }); if (!owner) return { error: 'OWNER_NOT_FOUND' }; }
  return { data: await prisma.lead.create({ data: { organizationId, ...body } }) };
});

app.patch('/api/v1/leads/:id', async request => {
  const { organizationId } = tenantContext(request); const { id } = idParam.parse(request.params); const body = leadUpdate.parse(request.body);
  if (body.customerId) { const customer = await prisma.customer.findFirst({ where: { id: body.customerId, organizationId }, select: { id: true } }); if (!customer) return { error: 'CUSTOMER_NOT_FOUND' }; }
  if (body.ownerId) { const owner = await prisma.user.findFirst({ where: { id: body.ownerId, organizationId }, select: { id: true } }); if (!owner) return { error: 'OWNER_NOT_FOUND' }; }
  const result = await prisma.lead.updateMany({ where: { id, organizationId }, data: body }); if (!result.count) return { error: 'LEAD_NOT_FOUND' };
  return { data: await prisma.lead.findFirst({ where: { id, organizationId }, include: { customer: true, owner: { select: { name: true } } } }) };
});

app.get('/api/v1/conversations', async request => {
  const { organizationId } = tenantContext(request); const query = request.query as { limit?: string }; const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 100);
  return { data: await prisma.conversation.findMany({ where: { organizationId }, include: { customer: true, channel: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: [{ priority: 'desc' }, { lastMessageAt: 'desc' }], take: limit }) };
});

app.patch('/api/v1/conversations/:id', async request => {
  const { organizationId } = tenantContext(request); const { id } = idParam.parse(request.params); const body = conversationUpdate.parse(request.body);
  const result = await prisma.conversation.updateMany({ where: { id, organizationId }, data: body }); if (!result.count) return { error: 'CONVERSATION_NOT_FOUND' };
  return { data: await prisma.conversation.findFirst({ where: { id, organizationId }, include: { customer: true, channel: true } }) };
});

app.get('/api/v1/conversations/:id/messages', async request => {
  const { organizationId } = tenantContext(request); const { id } = idParam.parse(request.params);
  const conversation = await prisma.conversation.findFirst({ where: { id, organizationId }, select: { id: true } }); if (!conversation) return { error: 'CONVERSATION_NOT_FOUND' };
  return { data: await prisma.message.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' }, take: 500 }) };
});

app.post('/api/v1/conversations/:id/messages', async request => {
  const { organizationId } = tenantContext(request); const { id } = idParam.parse(request.params); const body = messageCreate.parse(request.body);
  const conversation = await prisma.conversation.findFirst({ where: { id, organizationId }, select: { id: true } }); if (!conversation) return { error: 'CONVERSATION_NOT_FOUND' };
  const message = await prisma.message.create({ data: { conversationId: id, ...body } }); await prisma.conversation.updateMany({ where: { id, organizationId }, data: { lastMessageAt: message.createdAt } }); return { data: message };
});

app.get('/api/v1/follow-ups', async request => {
  const { organizationId } = tenantContext(request); return { data: await prisma.task.findMany({ where: { organizationId }, include: { customer: true, assignee: { select: { name: true } } }, orderBy: [{ status: 'asc' }, { priority: 'desc' }, { dueAt: 'asc' }], take: 100 }) };
});

app.post('/api/v1/follow-ups', async request => {
  const { organizationId } = tenantContext(request); const body = taskCreate.parse(request.body);
  if (body.customerId) { const customer = await prisma.customer.findFirst({ where: { id: body.customerId, organizationId }, select: { id: true } }); if (!customer) return { error: 'CUSTOMER_NOT_FOUND' }; }
  if (body.assigneeId) { const assignee = await prisma.user.findFirst({ where: { id: body.assigneeId, organizationId }, select: { id: true } }); if (!assignee) return { error: 'ASSIGNEE_NOT_FOUND' }; }
  return { data: await prisma.task.create({ data: { organizationId, ...body, dueAt: body.dueAt ? new Date(body.dueAt) : null } }) };
});

app.patch('/api/v1/follow-ups/:id', async request => {
  const { organizationId } = tenantContext(request); const { id } = idParam.parse(request.params); const body = taskUpdate.parse(request.body);
  const data = { ...body, ...(body.dueAt !== undefined ? { dueAt: body.dueAt ? new Date(body.dueAt) : null } : {}) };
  const result = await prisma.task.updateMany({ where: { id, organizationId }, data }); if (!result.count) return { error: 'FOLLOW_UP_NOT_FOUND' }; return { data: await prisma.task.findFirst({ where: { id, organizationId }, include: { customer: true, assignee: { select: { name: true } } } }) };
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  if (error instanceof z.ZodError) return reply.code(400).send({ error: 'VALIDATION_ERROR', details: error.issues });
  const status = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : 'Internal server error';
  return reply.code(status).send({ error: status >= 500 ? 'INTERNAL_SERVER_ERROR' : message });
});

initializeAutomationOrchestrator();
await registerEventRoutes(app);

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
