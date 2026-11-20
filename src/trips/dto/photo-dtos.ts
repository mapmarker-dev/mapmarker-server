import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { ApiIdProperty, IsAppId } from '../../common/app-id';
import { PHOTO_MAX_BYTES, THUMBNAIL_MAX_BYTES } from '../photo-rules';

/** 장소 사진. 주소는 서명돼 있어 유효 시간(1시간)이 지나면 여행을 다시 받아 새 주소를 쓴다. */
export class PhotoResponse {
  @ApiIdProperty()
  id: string;

  @ApiProperty({
    description: '원본(긴 변 1920px, 비율 그대로) 주소. 크게 볼 때',
  })
  url: string;

  @ApiProperty({
    description:
      '썸네일(사용자가 고른 정사각형 400×400) 주소. 지도 마커, 목록, 내보내기',
  })
  thumbnailUrl: string;
}

/** 업로드 주소 받기. 앱이 사진을 줄인 뒤 두 파일의 바이트 수를 보낸다(서명에 들어간다). */
export class CreatePhotoUploadDto {
  @IsAppId('앱이 만든 사진 ID(UUID v7). 등록할 때 같은 ID를 보낸다')
  photoId: string;

  @ApiProperty({ minimum: 1, maximum: PHOTO_MAX_BYTES })
  @IsInt()
  @Min(1)
  @Max(PHOTO_MAX_BYTES)
  size: number;

  @ApiProperty({ minimum: 1, maximum: THUMBNAIL_MAX_BYTES })
  @IsInt()
  @Min(1)
  @Max(THUMBNAIL_MAX_BYTES)
  thumbnailSize: number;
}

/** 파일 하나를 올릴 주소. [headers]를 그대로 붙여 본문에 파일 바이트를 담아 PUT한다. */
export class PresignedUploadResponse {
  @ApiProperty()
  url: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'string' },
    example: {
      'Content-Type': 'image/jpeg',
      'Content-Length': '345678',
      'x-amz-tagging': 'upload=pending',
    },
  })
  headers: Record<string, string>;
}

export class PhotoUploadResponse {
  @ApiIdProperty()
  photoId: string;

  @ApiProperty({ type: PresignedUploadResponse })
  original: PresignedUploadResponse;

  @ApiProperty({ type: PresignedUploadResponse })
  thumbnail: PresignedUploadResponse;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: '두 주소의 유효 시각(10분)',
  })
  expiresAt: string;
}

/** 올린 사진을 장소에 등록하기. 업로드 주소를 받을 때의 사진 ID다. */
export class RegisterPhotoDto {
  @IsAppId('업로드 주소를 받을 때 보낸 사진 ID')
  id: string;
}
