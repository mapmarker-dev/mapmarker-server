import { Module } from '@nestjs/common';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { SegmentsController } from './segments.controller';
import { SegmentsService } from './segments.service';
import { StopsController } from './stops.controller';
import { StopsService } from './stops.service';
import { TrashController } from './trash.controller';
import { TrashService } from './trash.service';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

/** 여행과 그 동선(장소·구간), 후보, 휴지통. 장소·구간·후보 쓰기도 동선 규칙을 같이 써서 이 모듈에 더한다. */
@Module({
  controllers: [
    TripsController,
    StopsController,
    SegmentsController,
    CandidatesController,
    TrashController,
  ],
  providers: [
    TripsService,
    StopsService,
    SegmentsService,
    CandidatesService,
    TrashService,
  ],
})
export class TripsModule {}
