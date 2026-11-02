import { ApiProperty } from '@nestjs/swagger';
import { IsLocalDate } from '../../common/local-date';
import { TripDates } from '../trip-dates';

/** 여행 기간. 앱 모델의 TripDates와 같다. */
export class TripDatesDto implements TripDates {
  @ApiProperty({ example: '2026-10-15', format: 'date' })
  @IsLocalDate()
  start: string;

  @ApiProperty({ example: '2026-10-17', format: 'date' })
  @IsLocalDate()
  end: string;
}
