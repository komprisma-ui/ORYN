import { prisma } from '../../lib/prisma.js';

export async function buildLeadInsights(organizationId: string) {
  const customers = await prisma.customer.findMany({ where: { organizationId }, select: { id: true, name: true, status: true, leadScore: true, updatedAt: true }, orderBy: { leadScore: 'desc' }, take: 20 });
  const hot = customers.filter(c => (c.leadScore ?? 0) >= 80 && ['HOT_LEAD','WARM_LEAD'].includes(c.status));
  return {
    generatedAt: new Date().toISOString(),
    summary: hot.length ? `${hot.length} pelanggan memiliki sinyal pembelian tinggi.` : 'Belum ada pelanggan dengan sinyal pembelian tinggi.',
    priorityCustomers: hot.slice(0, 10).map(c => ({ id: c.id, name: c.name, score: c.leadScore ?? 0, action: 'FOLLOW_UP' })),
    method: 'ORYN_RULES_V1'
  };
}
