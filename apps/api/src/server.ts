import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { z } from 'zod';
import { prisma } from './lib/prisma.js';
import { authUser, createSession, tenantContext, verifyPassword } from './lib/auth.js';
import { buildLeadInsights } from './modules/ai/insights.js';

const app = Fastify({ logger: true, requestIdHeader: 'x-request-id' });
const origins = (process.env.WEB_ORIGIN ?? '').split(',').map(v => v.trim()).filter(Boolean);
await app.register(cors, { origin: origins.length ? origins : true });
await app.register(helmet);
await app.register(sensible);

const idParam = z.object({ id: z.string().min(1).max(128) });
const customerStatus = z.enum(['NEW','ACTIVE','HOT_LEAD','WARM_LEAD','COLD_LEAD','CUSTOMER','VIP','INACTIVE','LOST']);
const customerCreate = z.object({ name: z.string().trim().min(1).max(160), phone: z.string().trim().max(40).optional(), email: z.string().email().optional(), source: z.string().trim().max(80).optional(), status: customerStatus.optional(), leadScore: z.number().int().min(0).max(100).optional(), notes: z.string().max(5000).optional(), assignedToId: z.string().min(1).max(128).nullable().optional() });
const customerUpdate = customerCreate.partial();
const messageCreate = z.object({ content: z.string().trim().min(1).max(10000), contentType: z.string().max(40).default('text'), direction: z.enum(['INBOUND','OUTBOUND']).default('OUTBOUND'), senderType: z.string().max(40).default('user'), aiGenerated: z.boolean().default(false) });
const conversationUpdate = z.object({ status: z.enum(['OPEN','PENDING','CLOSED']).optional(), priority: z.number().int().min(0).max(100).optional(), subject: z.string().max(200).nullable().optional() }).refine(v => Object.keys(v).length > 0, 'At least one field is required');
const taskUpdate = z.object({ status: z.enum(['TODO','IN_PROGRESS','DONE','CANCELED']).optional(), priority: z.number().int().min(0).max(100).optional(), dueAt: z.string().datetime().nullable().optional(), title: z.string().trim().min(1).max(240).optional() }).refine(v => Object.keys(v).length > 0, 'At least one field is required');
const tagInput = z.object({ name: z.string().trim().min(1).max(60), color: z.string().trim().max(20).optional() });
const loginInput = z.object({ organizationId: z.string().min(1).max(128), email: z.string().email(), password: z.string().min(8).max(200) });

app.addHook('onRequest', async (request, reply) => {
  if (request.url === '/health' || request.url === '/api/v1/auth/login') return;
  try { authUser(request); } catch { return reply.code(401).send({ error: 'UNAUTHENTICATED' }); }
});

app.get('/health', async () => ({ ok: true, service: 'oryn-api', version: '0.4.0', time: new Date().toISOString() }));

app.post('/api/v1/auth/login', async (request, reply) => {
  const body = loginInput.parse(request.body);
  const user = await prisma.user.findFirst({ where: { organizationId: body.organizationId, email: body.email.toLowerCase() } });
  if (!user?.passwordHash || !verifyPassword(body.password, user.passwordHash)) throw app.httpErrors.unauthorized('Invalid email or password');
  return { data: { token: createSession({ id: user.id, organizationId: user.organizationId, role: user.role, email: user.email }), user: { id: user.id, name: user.name, email: user.email, role: user.role, organizationId: user.organizationId } } };
});

app.get('/api/v1/auth/me', async request => {
  const user = authUser(request);
  const dbUser = await prisma.user.findFirst({ where: { id: user.id, organizationId: user.organizationId }, select: { id: true, name: true, email: true, role: true, organizationId: true } });
  if (!dbUser) throw app.httpErrors.unauthorized('User not found');
  return { data: dbUser };
});

app.get('/api/v1/dashboard', async request => {
  const { organizationId } = tenantContext(request);
  const [customers, conversations, followUps, leads, openChats, hotLeads, inboundMessages] = await Promise.all([
    prisma.customer.count({ where: { organizationId } }), prisma.conversation.count({ where: { organizationId } }), prisma.task.count({ where: { organizationId, status: { in: ['TODO','IN_PROGRESS'] } } }), prisma.lead.count({ where: { organizationId, stage: { notIn: ['WON','LOST'] } } }), prisma.conversation.count({ where: { organizationId, status: 'OPEN' } }), prisma.customer.count({ where: { organizationId, status: 'HOT_LEAD', leadScore: { gte: 80 } } }), prisma.message.count({ where: { conversation: { organizationId }, direction: 'INBOUND' } })
  ]);
  return { data: { customers, conversations, followUps, activeLeads: leads, openChats, hotLeadsNeedingFollowUp: hotLeads, inboundMessages } };
});

app.get('/api/v1/ai/insights', async request => { const { organizationId } = tenantContext(request); return { data: await buildLeadInsights(organizationId) }; });

app.get('/api/v1/customers', async request => {
  const { organizationId } = tenantContext(request);
  const query = z.object({ search: z.string().trim().optional(), status: customerStatus.optional(), limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().optional() }).parse(request.query);
  const data = await prisma.customer.findMany({ where: { organizationId, ...(query.status ? { status: query.status } : {}), ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { phone: { contains: query.search } }, { email: { contains: query.search, mode: 'insensitive' } }] } : {}) }, orderBy: { updatedAt: 'desc' }, take: query.limit, ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}) });
  return { data };
});

app.post('/api/v1/customers', async (request, reply) => {
  const { organizationId } = tenantContext(request); const body = customerCreate.parse(request.body);
  if (body.assignedToId && !await prisma.user.findFirst({ where: { id: body.assignedToId, organizationId }, select: { id: true } })) throw app.httpErrors.badRequest('Invalid assignee');
  reply.code(201); return { data: await prisma.customer.create({ data: { organizationId, ...body } }) };
});
app.patch('/api/v1/customers/:id', async request => {
  const { organizationId } = tenantContext(request); const { id } = idParam.parse(request.params); const body = customerUpdate.parse(request.body);
  if (!await prisma.customer.findFirst({ where: { id, organizationId }, select: { id: true } })) throw app.httpErrors.notFound('Customer not found');
  if (body.assignedToId && !await prisma.user.findFirst({ where: { id: body.assignedToId, organizationId }, select: { id: true } })) throw app.httpErrors.badRequest('Invalid assignee');
  return { data: await prisma.customer.update({ where: { id }, data: body }) };
});
app.get('/api/v1/customers/:id', async request => {
  const { organizationId } = tenantContext(request); const { id } = idParam.parse(request.params);
  const customer = await prisma.customer.findFirst({ where: { id, organizationId }, include: { tags: { include: { tag: true } }, conversations: { orderBy: { updatedAt: 'desc' }, take: 10, include: { channel: true } }, leads: { orderBy: { updatedAt: 'desc' }, take: 10 }, tasks: { orderBy: { dueAt: 'asc' }, take: 20, include: { assignee: true } } } });
  if (!customer) throw app.httpErrors.notFound('Customer not found'); return { data: customer };
});
app.post('/api/v1/customers/:id/tags', async request => {
  const { organizationId } = tenantContext(request); const { id } = idParam.parse(request.params); const body = tagInput.parse(request.body);
  if (!await prisma.customer.findFirst({ where: { id, organizationId }, select: { id: true } })) throw app.httpErrors.notFound('Customer not found');
  const tag = await prisma.tag.upsert({ where: { organizationId_name: { organizationId, name: body.name } }, update: { color: body.color }, create: { organizationId, ...body } });
  await prisma.customerTag.upsert({ where: { customerId_tagId: { customerId: id, tagId: tag.id } }, update: {}, create: { customerId: id, tagId: tag.id } }); return { data: tag };
});
app.delete('/api/v1/customers/:id/tags/:tagId', async request => {
  const { organizationId } = tenantContext(request); const { id, tagId } = z.object({ id: z.string().min(1), tagId: z.string().min(1) }).parse(request.params);
  const customer = await prisma.customer.findFirst({ where: { id, organizationId }, select: { id: true } }); const tag = await prisma.tag.findFirst({ where: { id: tagId, organizationId }, select: { id: true } });
  if (!customer || !tag) throw app.httpErrors.notFound('Customer or tag not found'); await prisma.customerTag.deleteMany({ where: { customerId: id, tagId } }); return { ok: true };
});

app.get('/api/v1/conversations', async request => {
  const { organizationId } = tenantContext(request); const query = z.object({ status: z.enum(['OPEN','PENDING','CLOSED']).optional(), search: z.string().trim().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }).parse(request.query);
  return { data: await prisma.conversation.findMany({ where: { organizationId, ...(query.status ? { status: query.status } : {}), ...(query.search ? { customer: { name: { contains: query.search, mode: 'insensitive' } } } : {}) }, orderBy: [{ priority: 'desc' }, { lastMessageAt: 'desc' }], take: query.limit, include: { customer: true, channel: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } } }) };
});
app.patch('/api/v1/conversations/:id', async request => {
  const { organizationId } = tenantContext(request); const { id } = idParam.parse(request.params); const body = conversationUpdate.parse(request.body);
  if (!await prisma.conversation.findFirst({ where: { id, organizationId }, select: { id: true } })) throw app.httpErrors.notFound('Conversation not found'); return { data: await prisma.conversation.update({ where: { id }, data: body }) };
});
app.get('/api/v1/conversations/:id/messages', async request => {
  const { organizationId } = tenantContext(request); const { id } = idParam.parse(request.params); const query = z.object({ limit: z.coerce.number().int().min(1).max(500).default(500) }).parse(request.query);
  if (!await prisma.conversation.findFirst({ where: { id, organizationId }, select: { id: true } })) throw app.httpErrors.notFound('Conversation not found'); return { data: await prisma.message.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' }, take: query.limit }) };
});
app.post('/api/v1/conversations/:id/messages', async (request, reply) => {
  const { organizationId } = tenantContext(request); const { id } = idParam.parse(request.params); const body = messageCreate.parse(request.body);
  if (!await prisma.conversation.findFirst({ where: { id, organizationId }, select: { id: true } })) throw app.httpErrors.notFound('Conversation not found');
  const [message] = await prisma.$transaction([prisma.message.create({ data: { conversationId: id, ...body } }), prisma.conversation.update({ where: { id }, data: { lastMessageAt: new Date(), status: 'OPEN' } })]); reply.code(201); return { data: message };
});

app.get('/api/v1/follow-ups', async request => {
  const { organizationId } = tenantContext(request); const query = z.object({ status: z.enum(['TODO','IN_PROGRESS','DONE','CANCELED']).optional() }).parse(request.query);
  return { data: await prisma.task.findMany({ where: { organizationId, ...(query.status ? { status: query.status } : { status: { in: ['TODO','IN_PROGRESS'] } }) }, orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }], take: 100, include: { customer: true, assignee: true } }) };
});
app.patch('/api/v1/follow-ups/:id', async request => {
  const { organizationId } = tenantContext(request); const { id } = idParam.parse(request.params); const body = taskUpdate.parse(request.body);
  if (!await prisma.task.findFirst({ where: { id, organizationId }, select: { id: true } })) throw app.httpErrors.notFound('Follow-up not found');
  const data = { ...body, ...(body.dueAt !== undefined ? { dueAt: body.dueAt ? new Date(body.dueAt) : null } : {}) }; return { data: await prisma.task.update({ where: { id }, data }) };
});

app.setErrorHandler((error, request, reply) => { request.log.error(error); if (error instanceof z.ZodError) return reply.code(400).send({ error: 'VALIDATION_ERROR', details: error.issues }); const status = (error as any).statusCode ?? 500; return reply.code(status).send({ error: status >= 500 ? 'INTERNAL_SERVER_ERROR' : error.message }); });

const port = Number(process.env.API_PORT ?? 4000);
await app.listen({ port, host: '0.0.0.0' });
