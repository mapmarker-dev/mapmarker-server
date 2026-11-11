import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiAppIdParam, AppIdParam } from '../common/app-id';
import { CreateStopDto } from './dto/create-stop.dto';
import { MoveStopDto } from './dto/move-stop.dto';
import { StopResponse } from './dto/stop-response.dto';
import { TripDetailResponse } from './dto/trip-detail-response.dto';
import { UpdateStopDto } from './dto/update-stop.dto';
import { StopsService } from './stops.service';

/**
 * 장소. 넣기는 여행 아래(/v1/trips/:tripId/stops), 나머지는 장소 ID로(/v1/stops/:stopId) 부른다.
 * 동선이 바뀌는 요청(넣기·옮기기·지우기·후보로 빼기)은 여행의 새 동선 전체를 돌려준다.
 */
@ApiTags('stops')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '토큰이 없거나 틀리거나 만료됨' })
@Controller()
export class StopsController {
  constructor(private readonly stopsService: StopsService) {}

  @Post('trips/:tripId/stops')
  @ApiAppIdParam('tripId')
  @ApiCreatedResponse({ type: TripDetailResponse, description: '새 동선' })
  @ApiBadRequestResponse({
    description: '입력이 틀림(여행 일수 밖의 일차 포함)',
  })
  @ApiNotFoundResponse({ description: '없거나 다른 사람의 여행' })
  @ApiConflictResponse({ description: '이미 있는 장소 ID' })
  create(
    @CurrentUser() user: AuthUser,
    @AppIdParam('tripId') tripId: string,
    @Body() dto: CreateStopDto,
  ): Promise<TripDetailResponse> {
    return this.stopsService.create(user.id, tripId, dto);
  }

  @Patch('stops/:stopId')
  @ApiAppIdParam('stopId')
  @ApiOkResponse({ type: StopResponse })
  @ApiBadRequestResponse({ description: '입력이 틀림(일차·순서는 받지 않음)' })
  @ApiNotFoundResponse({ description: '없거나 다른 사람의 장소' })
  update(
    @CurrentUser() user: AuthUser,
    @AppIdParam('stopId') stopId: string,
    @Body() dto: UpdateStopDto,
  ): Promise<StopResponse> {
    return this.stopsService.update(user.id, stopId, dto);
  }

  @Put('stops/:stopId/position')
  @ApiAppIdParam('stopId')
  @ApiOkResponse({ type: TripDetailResponse, description: '새 동선' })
  @ApiBadRequestResponse({ description: '여행 일수 밖의 일차' })
  @ApiNotFoundResponse({ description: '없거나 다른 사람의 장소' })
  move(
    @CurrentUser() user: AuthUser,
    @AppIdParam('stopId') stopId: string,
    @Body() dto: MoveStopDto,
  ): Promise<TripDetailResponse> {
    return this.stopsService.move(user.id, stopId, dto);
  }

  @Post('stops/:stopId/candidate')
  @HttpCode(HttpStatus.OK)
  @ApiAppIdParam('stopId')
  @ApiOkResponse({
    type: TripDetailResponse,
    description:
      '새 동선(장소가 같은 ID의 후보가 되어 맨 뒤에 오고, 앞뒤 장소는 새로 이어진다)',
  })
  @ApiNotFoundResponse({ description: '없거나 다른 사람의 장소' })
  @ApiConflictResponse({ description: '사진이 달린 장소' })
  demote(
    @CurrentUser() user: AuthUser,
    @AppIdParam('stopId') stopId: string,
  ): Promise<TripDetailResponse> {
    return this.stopsService.demote(user.id, stopId);
  }

  @Delete('stops/:stopId')
  @ApiAppIdParam('stopId')
  @ApiOkResponse({
    type: TripDetailResponse,
    description: '새 동선(앞뒤 장소가 새로 이어진다)',
  })
  @ApiNotFoundResponse({ description: '없거나 다른 사람의 장소' })
  @ApiConflictResponse({ description: '사진이 달린 장소' })
  remove(
    @CurrentUser() user: AuthUser,
    @AppIdParam('stopId') stopId: string,
  ): Promise<TripDetailResponse> {
    return this.stopsService.remove(user.id, stopId);
  }
}
