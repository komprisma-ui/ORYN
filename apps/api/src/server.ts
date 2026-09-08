import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

app.get('/health', async () => ({ ok: true, service: 'oryn-api', version: '0.1.0' }));
app.get('/api/v1/dashboard', async () => ({
  customers: 1248, incomingChats: 86, followUps: 32, sales: 18,
  insight: { hotLeadsNeedingFollowUp: 7, avgLeadScore: 87 }
}));
app.get('/api/v1/customers', async () => ({ data: [
  { id:'c_001', name:'Budi Santoso', status:'HOT_LEAD', leadScore:91, channel:'WHATSAPP' },
  { id:'c_002', name:'Nina Marlina', status:'ACTIVE', leadScore:78, channel:'WHATSAPP' },
  { id:'c_003', name:'Andi Pratama', status:'NEW', leadScore:62, channel:'WEB_CHAT' }
]}));

const port = Number(process.env.API_PORT ?? 4000);
app.listen({ port, host:'0.0.0.0' }).catch(err => { app.log.error(err); process.exit(1); });
