import { PrismaClient, UserRole, CustomerStatus, ChannelType, LeadStage, TaskStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const organization = await prisma.organization.upsert({ where: { id: 'org_demo' }, update: {}, create: { id: 'org_demo', name: 'ORYN Demo Company' } });
  const admin = await prisma.user.upsert({ where: { id: 'usr_demo_admin' }, update: {}, create: { id: 'usr_demo_admin', organizationId: organization.id, name: 'ORYN Admin', email: 'admin@oryn.local', role: UserRole.ADMIN } });
  const sales = await prisma.user.upsert({ where: { id: 'usr_demo_sales' }, update: {}, create: { id: 'usr_demo_sales', organizationId: organization.id, name: 'Andi Pratama', email: 'sales@oryn.local', role: UserRole.SALES } });
  const channel = await prisma.channel.upsert({ where: { id: 'chn_demo_whatsapp' }, update: {}, create: { id: 'chn_demo_whatsapp', organizationId: organization.id, type: ChannelType.WHATSAPP, name: 'WhatsApp Demo', active: true } });
  const customers = [
    ['cus_budi','Budi Santoso','+628123456789','HOT_LEAD',91],
    ['cus_nina','Nina Marlina','+628234567890','ACTIVE',78],
    ['cus_andi','Andi Pratama','+628345678901','NEW',62]
  ] as const;
  for (const [id, name, phone, status, leadScore] of customers) {
    const customer = await prisma.customer.upsert({ where: { id }, update: { name, phone, status: status as CustomerStatus, leadScore, assignedToId: sales.id }, create: { id, organizationId: organization.id, name, phone, status: status as CustomerStatus, leadScore, assignedToId: sales.id, source: 'demo' } });
    const conversation = await prisma.conversation.upsert({ where: { id: `conv_${id}` }, update: {}, create: { id: `conv_${id}`, organizationId: organization.id, customerId: customer.id, channelId: channel.id, priority: leadScore > 80 ? 10 : 5, lastMessageAt: new Date() } });
    const message = await prisma.message.findFirst({ where: { conversationId: conversation.id } });
    if (!message) await prisma.message.create({ data: { conversationId: conversation.id, direction: 'INBOUND', content: name === 'Budi Santoso' ? 'Kak, saya tertarik dengan paket premium. Berapa harganya?' : 'Halo, saya ingin informasi produk.', senderType: 'customer' } });
  }
  const budi = await prisma.customer.findUniqueOrThrow({ where: { id: 'cus_budi' } });
  await prisma.lead.upsert({ where: { id: 'lead_demo_budi' }, update: { stage: LeadStage.INTERESTED }, create: { id: 'lead_demo_budi', organizationId: organization.id, customerId: budi.id, stage: LeadStage.INTERESTED, probability: 80, ownerId: sales.id } });
  await prisma.task.upsert({ where: { id: 'task_demo_budi' }, update: {}, create: { id: 'task_demo_budi', organizationId: organization.id, customerId: budi.id, assigneeId: sales.id, title: 'Follow-up paket premium', dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000), priority: 10, status: TaskStatus.TODO, source: 'demo' } });
  await prisma.auditLog.create({ data: { organizationId: organization.id, actorId: admin.id, action: 'DEMO_SEED', entityType: 'Organization', entityId: organization.id, metadata: { version: '0.2.0' } } });
  console.log(`Seeded ${organization.name}`);
}

main().finally(() => prisma.$disconnect());
