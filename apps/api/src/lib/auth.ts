import type { FastifyRequest } from 'fastify';

export type TenantContext = { organizationId: string };

export function tenantContext(request: FastifyRequest): TenantContext {
  const organizationId = String(request.headers['x-oryn-organization-id'] ?? process.env.DEFAULT_ORGANIZATION_ID ?? 'demo');
  return { organizationId };
}
