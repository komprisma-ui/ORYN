import type { FastifyRequest } from 'fastify';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export type AuthUser = { id: string; organizationId: string; role: string; email: string };
export type TenantContext = { organizationId: string; user: AuthUser };

const secret = () => {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) throw new Error('AUTH_SECRET must be set to at least 32 characters');
  return value;
};

const b64 = (value: string) => Buffer.from(value).toString('base64url');
const unb64 = (value: string) => Buffer.from(value, 'base64url').toString('utf8');

export function hashPassword(password: string, salt = randomBytes(18).toString('base64url')): string {
  const derived = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, salt, expected] = stored.split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 }).toString('hex');
  const a = Buffer.from(actual, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createSession(user: AuthUser, ttlSeconds = 60 * 60 * 12): string {
  const payload = b64(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const signature = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySession(token: string): AuthUser {
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid session');
  const [payload, signature] = parts;
  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('Invalid session');
  let data: AuthUser & { exp: number };
  try { data = JSON.parse(unb64(payload)) as AuthUser & { exp: number }; } catch { throw new Error('Invalid session'); }
  if (!data.id || !data.organizationId || !data.email || !Number.isInteger(data.exp) || data.exp < Math.floor(Date.now() / 1000)) throw new Error('Session expired');
  return { id: data.id, organizationId: data.organizationId, role: data.role, email: data.email };
}

export function authUser(request: FastifyRequest): AuthUser {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new Error('Authentication required');
  const token = header.slice(7).trim();
  if (!token) throw new Error('Authentication required');
  return verifySession(token);
}

export function tenantContext(request: FastifyRequest): TenantContext {
  const user = authUser(request);
  return { organizationId: user.organizationId, user };
}
