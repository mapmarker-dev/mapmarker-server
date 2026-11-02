import { Module } from '@nestjs/common';
import { StopsController } from './stops.controller';
import { StopsService } from './stops.service';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

/** 여행과 그 동선(장소·구간). 장소·구간 쓰기도 동선 규칙을 같이 써서 이 모듈에 더한다. */
@Module({
  controllers: [TripsController, StopsController],
  providers: [TripsService, StopsService],
})
export class TripsModule {}
