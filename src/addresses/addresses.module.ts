import { Module } from '@nestjs/common';
import { AddressesController } from './addresses.controller';
import { AddressesService } from './addresses.service';
import { JusoClient } from './juso.client';

/** 주소 검색과 좌표 조회. 결과를 DB에 두지 않아서 Prisma를 쓰지 않는다. */
@Module({
  controllers: [AddressesController],
  providers: [AddressesService, JusoClient],
})
export class AddressesModule {}
