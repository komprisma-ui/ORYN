import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { z } from 'zod';
import { prisma } from './lib/prisma.js';
import { tenantContext } from './lib/auth.js';
import { buildLeadInsights } from './modules/ai/insights.js';

const app = Fastify({ logger: true, requestIdHeader: 'x-request-id' });
await app.register(cors, { origin: process.env.WEB_ORIGIN ? process.env.WEB_ORIGIN.split(',').map(v => v.trim()) : true });
await app.register(helmet);
await app.register(sensible);

const customerCreate = z.object({ name: z.string().min(1).max(160), phone: z.string().max(40).optional(), email: z.string().email().optional(), source: z.string().max(80).optional(), status: z.enum(['NEW','ACTIVE','HOT_LEAD','WARM_LEAD','COLD_LEAD','CUSTOMER','VIP','INACTIVE','LOST']).optional(), leadScore: z.number().int().min(0).max(100).optional() });
const messageCreate = z.object({ content: z.string().min(1).max(10000), contentType: z.string().max(40).default('text'), direction: z.enum(['INBOUND','OUTBOUND']).default('OUTBOUND'), senderType: z.string().max(40).default('user'), aiGenerated: z.boolean().default(false) });

app.get('/health', async () => ({ ok: true, service: 'oryn-api', version: '0.2.0', time: new Date().toISOString() }));

app.get('/api/v1/dashboard', async (request) => {
  const { organizationId } = tenantContext(request);
  const [customers, conversations, followUps, leads, openChats] = await Promise.all([
    prisma.customer.count({ where: { organizationId } }),
    prisma.conversation.count({ where: { organizationId } }),
    prisma.task.count({ where: { organizationId, status: { in: ['TODO','IN_PROGRESS'] } } }),
    prisma.lead.count({ where: { organizationId, stage: { notIn: ['WON','LOST'] } } }),
    prisma.conversation.count({ where: { organizationId, status: 'OPEN' } })
  ]);
  const hot = await prisma.customer.count({ where: { organizationId, status: 'HOT_LEAD', leadScore: { gte: 80 } } });
  return { data: { customers, conversations, followUps, activeLeads: leads, openChats, hotLeadsNeedingFollowUp: hot } };
});

app.get('/api/v1/ai/insights', async (request) => {
  const { organizationId } = tenantContext(request);
  return { data: await buildLeadInsights(organizationId) };
});

app.get('/api/v1/customers', async (request) => {
  const { organizationId } = tenantContext(request);
  const query = z.object({ search: z.string().optional(), status: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().optional() }).parse(request.query);
  const data = await prisma.customer.findMany({ where: { organizationId, ...(query.status ? { status: query.status as any } : {}), ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { phone: { contains: query.search } }, { email: { contains: query.search, mode: 'insensitive' } }] } : {}) }, orderBy: { updatedAt: 'desc' }, take: query.limit, ...(query.cursor ? { skip: 1, cursor: { id: query.cursor } } : {}) });
  return { data };
});

app.post('/api/v1/customers', async (request, reply) => {
  const { organizationId } = tenantContext(request);
  const body = customerCreate.parse(request.body);
  const customer = await prisma.customer.create({ data: { organizationId, ...body } });
  reply.code(201);
  return { data: customer };
});

app.get('/api/v1/customers/:id', async (request) => {
  const { organizationId } = tenantContext(request);
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const customer = await prisma.customer.findFirst({ where: { id, organizationId }, include: { tags: { include: { tag: true } }, conversations: { orderBy: { updatedAt: 'desc' }, take: 10, include: { channel: true } }, leads: { orderBy: { updatedAt: 'desc' }, take: 10 }, tasks: { orderBy: { dueAt: 'asc' }, take: 20 } } });
  if (!customer) throw app.httpErrors.notFound('Customer not found');
  return { data: customer };
});

app.get('/api/v1/conversations', async (request) => {
  const { organizationId } = tenantContext(request);
  const query = z.object({ status: z.enum(['OPEN','PENDING','CLOSED']).optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }).parse(request.query);
  const data = await prisma.conversation.findMany({ where: { organizationId, ...(query.status ? { status: query.status } : {}) }, orderBy: [{ priority: 'desc' }, { lastMessageAt: 'desc' }], take: query.limit, include: { customer: true, channel: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } } });
  return { data };
});

app.get('/api/v1/conversations/:id/messages', async (request) => {
  const { organizationId } = tenantContext(request);
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const conversation = await prisma.conversation.findFirst({ where: { id, organizationId }, select: { id: true } });
  if (!conversation) throw app.httpErrors.notFound('Conversation not found');
  return { data: await prisma.message.findMany({ where: { conversationId: id }, orderBy: { createdAt: 'asc' }, take: 500 }) };
});

app.post('/api/v1/conversations/:id/messages', async (request, reply) => {
  const { organizationId } = tenantContext(request);
  const { id } = z.object({ id: z.string().min(1) }).parse(request.params);
  const body = messageCreate.parse(request.body);
  const conversation = await prisma.conversation.findFirst({ where: { id, organizationId } });
  if (!conversation) throw app.httpErrors.notFound('Conversation not found');
  const [message] = await prisma.$transaction([
    prisma.message.create({ data: { conversationId: id, ...body } }),
    prisma.conversation.update({ where: { id }, data: { lastMessageAt: new Date(), status: 'OPEN' } })
  ]);
  reply.code(201);
  return { data: message };
});

app.get('/api/v1/follow-ups', async (request) => {
  const { organizationId } = tenantContext(request);
  return { data: await prisma.task.findMany({ where: { organizationId, status: { in: ['TODO','IN_PROGRESS'] } }, orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }], take: 100, include: { customer: true, assignee: true } }) };
});

app.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  if (error instanceof z.ZodError) return reply.code(400).send({ error: 'VALIDATION_ERROR', details: error.issues });
  return reply.code((error as any).statusCode ?? 500).send({ error: error.message || 'Internal server error' });
});

const port = Number(process.env.API_PORT ?? 4000);
await app.listen({ port, host: '0.0.0.0' });
