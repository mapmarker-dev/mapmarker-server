import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SegmentResponse, toSegmentResponse } from './dto/segment-response.dto';
import { TransportLegDto, UpdateSegmentDto } from './dto/update-segment.dto';
import { TransportLeg } from './transport-leg';
import { touchTrip } from './trip-touch';

/**
 * 구간. 만들고 지우는 것은 장소를 넣고 옮기고 지울 때 서버가 동선으로 정한다(StopsService).
 * 여기서는 이동 수단·곡률·종류만 고친다. 구간 ID와 잇는 장소는 그대로다.
 */
@Injectable()
export class SegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async update(
    userId: string,
    segmentId: string,
    dto: UpdateSegmentDto,
  ): Promise<SegmentResponse> {
    const segment = await this.prisma.segment.findFirst({
      where: { id: segmentId, trip: { userId } },
    });
    if (!segment) throw new NotFoundException();
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.segment.update({
        where: { id: segmentId },
        data: {
          legs: dto.legs?.map(toStoredLeg),
          curvature: dto.curvature,
          type: dto.type,
        },
      });
      await touchTrip(tx, segment.tripId);
      return toSegmentResponse(updated);
    });
  }
}

/** DB(jsonb)에 담을 토막. 보내지 않은 필드는 키도 넣지 않는다. */
function toStoredLeg(leg: TransportLegDto): TransportLeg {
  return {
    mode: leg.mode,
    ...(leg.stopCount !== undefined && { stopCount: leg.stopCount }),
    ...(leg.durationMinutes !== undefined && {
      durationMinutes: leg.durationMinutes,
    }),
  };
}
