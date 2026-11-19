import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { PhotoStorage } from './photo-storage';
import { createS3Client, S3PhotoStorage } from './s3-photo-storage';

/**
 * 사진 파일 저장소. 장소 지우기, 휴지통, 사진 API가 함께 써서 전역 모듈이다.
 * S3 클라이언트는 만들 때 AWS에 붙지 않아서, 자격 증명이 없어도 서버는 뜨고 사진 요청만 실패한다.
 */
@Global()
@Module({
  providers: [
    {
      provide: PhotoStorage,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new S3PhotoStorage(
          createS3Client({
            region: config.get('AWS_REGION', { infer: true }),
            profile: config.get('AWS_PROFILE', { infer: true }),
          }),
          config.get('S3_PHOTO_BUCKET', { infer: true }),
        ),
    },
  ],
  exports: [PhotoStorage],
})
export class StorageModule {}
