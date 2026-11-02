import { BadRequestException } from '@nestjs/common';
import { daysBetween } from '../common/local-date';

/** 여행 기간. 둘 다 "2026-10-15" 형식이고, 시작일과 종료일 모두 여행에 들어간다. */
export interface TripDates {
  start: string;
  end: string;
}

/**
 * 박 수와 기간이 맞는지. 기간이 있으면 박 수 = 종료일 − 시작일이다(앱의 TripDates.nights와 같다).
 * 서버가 박 수를 대신 계산하지 않는다. 앱이 둘을 맞춰 보내므로, 어긋나면 앱 버그로 드러나게 400을 낸다.
 * DB의 CHECK 제약도 같은 규칙을 막지만, 거기까지 가면 500이 되므로 먼저 확인한다.
 */
export function checkTripDates(nights: number, dates: TripDates | null): void {
  if (!dates) return;
  const days = daysBetween(dates.start, dates.end);
  if (days < 0) {
    throw new BadRequestException('종료일이 시작일보다 앞입니다');
  }
  if (days !== nights) {
    throw new BadRequestException(
      `박 수(nights: ${nights})가 기간(${days}박)과 맞지 않습니다`,
    );
  }
}
