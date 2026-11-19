import { Injectable } from '@nestjs/common';
import { PhotoStorage } from '../storage/photo-storage';
import { PhotoResponse } from './dto/photo-dtos';
import { DOWNLOAD_URL_SECONDS, thumbnailKeyOf } from './photo-rules';

/** 사진 줄을 응답으로 바꾼다. 주소는 응답마다 새로 서명한다(S3에 요청하지 않고 서버 안에서 계산한다). */
@Injectable()
export class PhotoLinks {
  constructor(private readonly storage: PhotoStorage) {}

  async of(photo: { id: string; storageKey: string }): Promise<PhotoResponse> {
    const [url, thumbnailUrl] = await Promise.all([
      this.storage.presignDownload(photo.storageKey, DOWNLOAD_URL_SECONDS),
      this.storage.presignDownload(
        thumbnailKeyOf(photo.storageKey),
        DOWNLOAD_URL_SECONDS,
      ),
    ]);
    return { id: photo.id, url, thumbnailUrl };
  }

  /** 장소 ID별 사진(장소마다 첫 사진 하나). */
  async byStop(
    photos: readonly { id: string; stopId: string; storageKey: string }[],
  ): Promise<Map<string, PhotoResponse>> {
    const first = new Map<string, (typeof photos)[number]>();
    for (const photo of photos) {
      if (!first.has(photo.stopId)) first.set(photo.stopId, photo);
    }
    const entries = await Promise.all(
      [...first].map(
        async ([stopId, photo]) => [stopId, await this.of(photo)] as const,
      ),
    );
    return new Map(entries);
  }
}
