import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** 모든 기능 모듈이 DB를 쓰므로 전역으로 둔다. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
