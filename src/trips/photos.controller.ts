import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiInternalServerErrorResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { ApiAppIdParam, AppIdParam } from '../common/app-id';
import {
  CreatePhotoUploadDto,
  PhotoUploadResponse,
  RegisterPhotoDto,
} from './dto/photo-dtos';
import { StopResponse } from './dto/stop-response.dto';
import { PhotosService } from './photos.service';

/**
 * 장소 사진(지금은 장소마다 1장). 업로드 주소 받기 → 앱이 S3에 직접 올리기 → 등록 순서다.
 * 장소 지우기, 후보로 빼기, 여행 영구 삭제도 사진 파일을 함께 지운다.
 */
@ApiTags('photos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: '토큰이 없거나 틀리거나 만료됨' })
@ApiServiceUnavailableResponse({ description: 'S3에 닿지 못함' })
@ApiInternalServerErrorResponse({ description: 'S3 권한이나 버킷 설정 문제' })
@Controller('stops/:stopId')
export class PhotosController {
  constructor(private readonly photosService: PhotosService) {}

  @Post('photo-uploads')
  @ApiAppIdParam('stopId')
  @ApiCreatedResponse({
    type: PhotoUploadResponse,
    description: '원본과 썸네일의 업로드 주소(10분)',
  })
  @ApiBadRequestResponse({ description: '입력이 틀림(크기 상한 포함)' })
  @ApiNotFoundResponse({ description: '없거나 다른 사람의 장소' })
  @ApiConflictResponse({ description: '이미 있는 사진 ID' })
  createUpload(
    @CurrentUser() user: AuthUser,
    @AppIdParam('stopId') stopId: string,
    @Body() dto: CreatePhotoUploadDto,
  ): Promise<PhotoUploadResponse> {
    return this.photosService.createUpload(user.id, stopId, dto);
  }

  @Put('photo')
  @ApiAppIdParam('stopId')
  @ApiOkResponse({
    type: StopResponse,
    description: '사진이 든 장소(전에 있던 사진은 지웠다)',
  })
  @ApiNotFoundResponse({ description: '없거나 다른 사람의 장소' })
  @ApiConflictResponse({
    description: '파일이 아직 없음, 형식이나 크기가 틀림, 다른 장소의 사진 ID',
  })
  register(
    @CurrentUser() user: AuthUser,
    @AppIdParam('stopId') stopId: string,
    @Body() dto: RegisterPhotoDto,
  ): Promise<StopResponse> {
    return this.photosService.register(user.id, stopId, dto);
  }

  @Delete('photo')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAppIdParam('stopId')
  @ApiNoContentResponse({ description: '지웠거나 사진이 없었음' })
  @ApiNotFoundResponse({ description: '없거나 다른 사람의 장소' })
  remove(
    @CurrentUser() user: AuthUser,
    @AppIdParam('stopId') stopId: string,
  ): Promise<void> {
    return this.photosService.remove(user.id, stopId);
  }
}
