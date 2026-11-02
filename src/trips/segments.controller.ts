import { Body, Controller, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiAppIdParam, AppIdParam } from '../common/app-id';
import { SegmentResponse } from './dto/segment-response.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';
import { SegmentsService } from './segments.service';

/** 구간. 만들기·지우기는 장소 API가 동선에 맞춰 하고, 여기서는 고치기만 한다. */
@ApiTags('segments')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '토큰이 없거나 틀리거나 만료됨' })
@Controller('segments')
export class SegmentsController {
  constructor(private readonly segmentsService: SegmentsService) {}

  @Patch(':segmentId')
  @ApiAppIdParam('segmentId')
  @ApiOkResponse({ type: SegmentResponse, description: '고친 구간(ID 그대로)' })
  @ApiBadRequestResponse({ description: '입력이 틀림(잇는 장소는 받지 않음)' })
  @ApiNotFoundResponse({ description: '없거나 다른 사람의 구간' })
  update(
    @CurrentUser() user: AuthUser,
    @AppIdParam('segmentId') segmentId: string,
    @Body() dto: UpdateSegmentDto,
  ): Promise<SegmentResponse> {
    return this.segmentsService.update(user.id, segmentId, dto);
  }
}
