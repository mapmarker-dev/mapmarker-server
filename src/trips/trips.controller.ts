import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiAppIdParam, AppIdParam } from '../common/app-id';
import { CreateTripDto } from './dto/create-trip.dto';
import { TripDetailResponse } from './dto/trip-detail-response.dto';
import { TripResponse } from './dto/trip-response.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { TripsService } from './trips.service';

/** 경로의 여행 ID. 앱이 만든 UUID v7이 아니면 400. */
const TripId = () => AppIdParam('tripId');

@ApiTags('trips')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '토큰이 없거나 틀리거나 만료됨' })
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Get()
  @ApiOkResponse({ type: [TripResponse], description: '최근에 고친 순서' })
  list(@CurrentUser() user: AuthUser): Promise<TripResponse[]> {
    return this.tripsService.list(user.id);
  }

  @Post()
  @ApiCreatedResponse({ type: TripResponse })
  @ApiBadRequestResponse({
    description: '입력이 틀림(기간과 박 수 불일치 포함)',
  })
  @ApiConflictResponse({ description: '이미 있는 ID' })
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTripDto,
  ): Promise<TripResponse> {
    return this.tripsService.create(user.id, dto);
  }

  @Get(':tripId')
  @ApiAppIdParam('tripId')
  @ApiOkResponse({ type: TripDetailResponse })
  @ApiNotFoundResponse({ description: '없거나 다른 사람의 여행' })
  get(
    @CurrentUser() user: AuthUser,
    @TripId() tripId: string,
  ): Promise<TripDetailResponse> {
    return this.tripsService.get(user.id, tripId);
  }

  @Patch(':tripId')
  @ApiAppIdParam('tripId')
  @ApiOkResponse({ type: TripResponse })
  @ApiBadRequestResponse({
    description: '입력이 틀림(기간과 박 수 불일치 포함)',
  })
  @ApiNotFoundResponse({ description: '없거나 다른 사람의 여행' })
  @ApiConflictResponse({ description: '줄인 기간 밖 일차에 장소가 남음' })
  update(
    @CurrentUser() user: AuthUser,
    @TripId() tripId: string,
    @Body() dto: UpdateTripDto,
  ): Promise<TripResponse> {
    return this.tripsService.update(user.id, tripId, dto);
  }

  @Delete(':tripId')
  @ApiAppIdParam('tripId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({
    description: '휴지통으로 옮긴다. 30일 뒤 장소·구간과 함께 지운다',
  })
  @ApiNotFoundResponse({
    description: '없거나 다른 사람의 여행, 이미 휴지통에 있음',
  })
  remove(
    @CurrentUser() user: AuthUser,
    @TripId() tripId: string,
  ): Promise<void> {
    return this.tripsService.moveToTrash(user.id, tripId);
  }
}
