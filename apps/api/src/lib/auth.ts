import type { FastifyRequest } from 'fastify';

export type TenantContext = { organizationId: string };

export function tenantContext(request: FastifyRequest): TenantContext {
  const raw = request.headers['x-oryn-organization-id'];
  const organizationId = String(raw ?? process.env.DEFAULT_ORGANIZATION_ID ?? 'org_demo').trim();
  if (!organizationId || organizationId.length > 128) throw new Error('Invalid organization context');
  return { organizationId };
}
