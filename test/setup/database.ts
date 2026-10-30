import { PrismaClient } from '../../src/generated/prisma/client';

/** 테스트 DB의 모든 테이블을 비운다(마이그레이션 기록은 남긴다). 테스트마다 빈 DB에서 시작하려고 쓴다. */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const names = tables.map(({ tablename }) => `"${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${names} CASCADE`);
}
