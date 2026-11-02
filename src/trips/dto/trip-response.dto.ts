import { ApiProperty } from '@nestjs/swagger';
import { ApiIdProperty } from '../../common/app-id';
import { formatLocalDate } from '../../common/local-date';
import type { Trip } from '../../generated/prisma/client';
import {
  MapProvider,
  Season,
  TripOrigin,
  TripPhase,
} from '../../generated/prisma/enums';
import { TripDatesDto } from './trip-dates.dto';

/** 여행. 필드 이름과 모양은 앱 모델(Trip)과 같다. */
export class TripResponse {
  @ApiIdProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  region: string;

  @ApiProperty()
  nights: number;

  @ApiProperty({ enum: Season, enumName: 'Season' })
  season: Season;

  @ApiProperty({ type: TripDatesDto, nullable: true })
  dates: TripDatesDto | null;

  @ApiProperty({ enum: TripPhase, enumName: 'TripPhase', nullable: true })
  phaseOverride: TripPhase | null;

  @ApiProperty({ enum: MapProvider, enumName: 'MapProvider', nullable: true })
  mapProvider: MapProvider | null;

  @ApiProperty({ enum: TripOrigin, enumName: 'TripOrigin' })
  origin: TripOrigin;

  @ApiIdProperty(true)
  copiedFromTripId: string | null;

  @ApiProperty({ type: String, nullable: true })
  shareId: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export function toTripResponse(trip: Trip): TripResponse {
  return {
    id: trip.id,
    title: trip.title,
    region: trip.region,
    nights: trip.nights,
    season: trip.season,
    dates:
      trip.startDate && trip.endDate
        ? {
            start: formatLocalDate(trip.startDate),
            end: formatLocalDate(trip.endDate),
          }
        : null,
    phaseOverride: trip.phaseOverride,
    mapProvider: trip.mapProvider,
    origin: trip.origin,
    copiedFromTripId: trip.copiedFromTripId,
    shareId: trip.shareId,
    createdAt: trip.createdAt.toISOString(),
    updatedAt: trip.updatedAt.toISOString(),
  };
}
