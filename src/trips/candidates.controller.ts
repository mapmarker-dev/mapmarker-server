import {
  Body,
  Controller,
  Delete,
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
import { CandidatesService } from './candidates.service';
import { CandidateResponse } from './dto/candidate-response.dto';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';

/**
 * 후보 장소. 넣기는 여행 아래(/v1/trips/:tripId/candidates), 나머지는 후보 ID로(/v1/candidates/:candidateId) 부른다.
 * 동선이 바뀌지 않아서 후보 하나만 돌려준다. 여행을 읽으면(GET /v1/trips/:id) 후보 목록이 함께 온다.
 */
@ApiTags('candidates')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '토큰이 없거나 틀리거나 만료됨' })
@Controller()
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Post('trips/:tripId/candidates')
  @ApiAppIdParam('tripId')
  @ApiCreatedResponse({ type: CandidateResponse })
  @ApiBadRequestResponse({ description: '입력이 틀림' })
  @ApiNotFoundResponse({ description: '없거나 다른 사람의 여행' })
  @ApiConflictResponse({ description: '같은 ID의 후보나 장소가 있음' })
  create(
    @CurrentUser() user: AuthUser,
    @AppIdParam('tripId') tripId: string,
    @Body() dto: CreateCandidateDto,
  ): Promise<CandidateResponse> {
    return this.candidatesService.create(user.id, tripId, dto);
  }

  @Patch('candidates/:candidateId')
  @ApiAppIdParam('candidateId')
  @ApiOkResponse({ type: CandidateResponse })
  @ApiBadRequestResponse({ description: '입력이 틀림' })
  @ApiNotFoundResponse({ description: '없거나 다른 사람의 후보' })
  update(
    @CurrentUser() user: AuthUser,
    @AppIdParam('candidateId') candidateId: string,
    @Body() dto: UpdateCandidateDto,
  ): Promise<CandidateResponse> {
    return this.candidatesService.update(user.id, candidateId, dto);
  }

  @Delete('candidates/:candidateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAppIdParam('candidateId')
  @ApiNoContentResponse({ description: '지움' })
  @ApiNotFoundResponse({ description: '없거나 다른 사람의 후보' })
  remove(
    @CurrentUser() user: AuthUser,
    @AppIdParam('candidateId') candidateId: string,
  ): Promise<void> {
    return this.candidatesService.remove(user.id, candidateId);
  }
}
