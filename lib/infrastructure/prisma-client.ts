import 'server-only';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../app/generated/prisma/client';
import { PlatformError } from '../domain/errors';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new PlatformError('CONFIGURATION_ERROR', 'DATABASE_URL is required when ASE_PERSISTENCE_MODE=postgres.');
  }
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  globalForPrisma.prisma = client;
  return client;
}
