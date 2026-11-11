import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiAppIdParam, AppIdParam } from '../common/app-id';
import { TrashedTripResponse } from './dto/trashed-trip-response.dto';
import { TripResponse } from './dto/trip-response.dto';
import { TrashService } from './trash.service';

/** 경로의 여행 ID. 앱이 만든 UUID v7이 아니면 400. */
const TripId = () => AppIdParam('tripId');

const NOT_IN_TRASH = '휴지통에 없거나(보관 기간 끝남 포함) 다른 사람의 여행';

/** 휴지통. 여행을 넣는 것은 DELETE /trips/:tripId다. */
@ApiTags('trash')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '토큰이 없거나 틀리거나 만료됨' })
@Controller('trash')
export class TrashController {
  constructor(private readonly trashService: TrashService) {}

  @Get()
  @ApiOkResponse({
    type: [TrashedTripResponse],
    description: '최근에 넣은 순서. 보관 기간이 끝난 여행은 빠진다',
  })
  list(@CurrentUser() user: AuthUser): Promise<TrashedTripResponse[]> {
    return this.trashService.list(user.id);
  }

  @Post(':tripId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiAppIdParam('tripId')
  @ApiOkResponse({
    type: TripResponse,
    description: '되살린 여행. 고친 시각이 그대로라 목록의 원래 자리로 간다',
  })
  @ApiNotFoundResponse({ description: NOT_IN_TRASH })
  restore(
    @CurrentUser() user: AuthUser,
    @TripId() tripId: string,
  ): Promise<TripResponse> {
    return this.trashService.restore(user.id, tripId);
  }

  @Delete(':tripId')
  @ApiAppIdParam('tripId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: '장소·구간도 함께 영구 삭제한다' })
  @ApiNotFoundResponse({ description: NOT_IN_TRASH })
  @ApiConflictResponse({ description: '사진이 달린 장소가 있음' })
  remove(
    @CurrentUser() user: AuthUser,
    @TripId() tripId: string,
  ): Promise<void> {
    return this.trashService.removeForever(user.id, tripId);
  }
}
