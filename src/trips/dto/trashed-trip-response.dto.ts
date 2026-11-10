import { ApiProperty } from '@nestjs/swagger';
import type { Trip } from '../../generated/prisma/client';
import { purgeAt } from '../trash-retention';
import { toTripResponse, TripResponse } from './trip-response.dto';

/** 휴지통의 여행. 여행 필드에 넣은 시각과 지울 시각을 더한다. */
export class TrashedTripResponse extends TripResponse {
  @ApiProperty({ format: 'date-time', description: '휴지통에 넣은 시각' })
  deletedAt: string;

  @ApiProperty({
    format: 'date-time',
    description: '완전히 지울 시각(넣은 뒤 30일). 이때부터 되살릴 수 없다',
  })
  purgeAt: string;
}

/** [trip]은 휴지통의 여행이어야 한다(deletedAt이 있음). */
export function toTrashedTripResponse(
  trip: Trip & { deletedAt: Date },
): TrashedTripResponse {
  return Object.assign(toTripResponse(trip), {
    deletedAt: trip.deletedAt.toISOString(),
    purgeAt: purgeAt(trip.deletedAt).toISOString(),
  });
}
