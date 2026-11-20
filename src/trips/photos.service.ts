import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PHOTO_CONTENT_TYPE, PhotoStorage } from '../storage/photo-storage';
import {
  CreatePhotoUploadDto,
  PhotoUploadResponse,
  RegisterPhotoDto,
} from './dto/photo-dtos';
import { StopResponse, toStopResponse } from './dto/stop-response.dto';
import { PhotoLinks } from './photo-links';
import {
  deletePhotos,
  PHOTO_MAX_BYTES,
  PHOTO_TX_OPTIONS,
  photoKey,
  THUMBNAIL_MAX_BYTES,
  thumbnailKeyOf,
  UPLOAD_URL_SECONDS,
} from './photo-rules';
import { lockOwnedTrip } from './trip-lock';
import { touchTrip } from './trip-touch';

/**
 * 장소 사진. 앱이 줄인 원본과 썸네일을 업로드 주소로 S3에 직접 올리고, 다 올리면 등록한다.
 *
 * 1. `createUpload`: 두 파일의 업로드 주소(10분). DB에는 아무것도 쓰지 않는다.
 * 2. 앱이 S3에 PUT. 파일에는 "등록 전" 태그가 붙어 등록하지 않으면 하루 뒤 S3가 지운다.
 * 3. `register`: 파일이 있는지 보고 태그를 떼어 사진으로 등록한다. 사진이 이미 있으면 바꾼다.
 *
 * 남의 장소, 휴지통 여행의 장소는 404다.
 */
@Injectable()
export class PhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: PhotoStorage,
    private readonly links: PhotoLinks,
  ) {}

  /** 업로드 주소. 이미 있는 사진 ID면 409(같은 키에 올리면 등록된 파일을 덮어쓴다). */
  async createUpload(
    userId: string,
    stopId: string,
    dto: CreatePhotoUploadDto,
  ): Promise<PhotoUploadResponse> {
    const { tripId } = await this.findOwnedStop(userId, stopId);
    const taken = await this.prisma.photo.findUnique({
      where: { id: dto.photoId },
      select: { id: true },
    });
    if (taken) throw new ConflictException('이미 있는 사진 ID입니다');

    const key = photoKey(userId, tripId, dto.photoId);
    const expiresAt = new Date(Date.now() + UPLOAD_URL_SECONDS * 1000);
    const [original, thumbnail] = await Promise.all([
      this.storage.presignUpload(key, dto.size, UPLOAD_URL_SECONDS),
      this.storage.presignUpload(
        thumbnailKeyOf(key),
        dto.thumbnailSize,
        UPLOAD_URL_SECONDS,
      ),
    ]);
    return {
      photoId: dto.photoId,
      original,
      thumbnail,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * 올린 사진을 장소에 등록하고 사진이 든 장소를 돌려준다. 장소에 다른 사진이 있으면 그 파일과 줄을 지운다(장소마다 1장).
   * 파일이 아직 없거나 형식·크기가 틀리면 409. 같은 장소에 이미 등록한 ID면 그대로 돌려준다(응답을 잃고 다시 보낸 경우).
   */
  async register(
    userId: string,
    stopId: string,
    dto: RegisterPhotoDto,
  ): Promise<StopResponse> {
    const { tripId } = await this.findOwnedStop(userId, stopId);
    const key = photoKey(userId, tripId, dto.id);
    const thumbnailKey = thumbnailKeyOf(key);
    await this.ensureUploaded(key, PHOTO_MAX_BYTES);
    await this.ensureUploaded(thumbnailKey, THUMBNAIL_MAX_BYTES);

    return this.prisma.$transaction(async (tx) => {
      await lockOwnedTrip(tx, userId, tripId);
      // 잠그기 전에 다른 요청이 장소를 지웠거나 후보로 뺐을 수 있다.
      const stop = await tx.stop.findFirst({ where: { id: stopId, tripId } });
      if (!stop) throw new NotFoundException();

      const existing = await tx.photo.findUnique({ where: { id: dto.id } });
      if (existing && existing.stopId !== stopId) {
        throw new ConflictException('이미 있는 사진 ID입니다');
      }
      if (!existing) {
        await deletePhotos(tx, this.storage, { stopId });
        await tx.photo.create({
          data: { id: dto.id, stopId, storageKey: key },
        });
        // 줄을 만든 뒤 태그를 뗀다. 떼다 실패하면 트랜잭션이 되돌아가고 파일은 하루 뒤 S3가 지운다.
        await this.storage.markUploaded(key);
        await this.storage.markUploaded(thumbnailKey);
        await touchTrip(tx, tripId);
      }
      return toStopResponse(
        stop,
        await this.links.of({ id: dto.id, storageKey: key }),
      );
    }, PHOTO_TX_OPTIONS);
  }

  /** 장소의 사진을 S3 파일부터 지운다. 사진이 없어도 204다(응답을 잃고 다시 보낸 경우). */
  async remove(userId: string, stopId: string): Promise<void> {
    const { tripId } = await this.findOwnedStop(userId, stopId);
    await this.prisma.$transaction(async (tx) => {
      await lockOwnedTrip(tx, userId, tripId);
      const removed = await deletePhotos(tx, this.storage, {
        stopId,
        stop: { tripId },
      });
      if (removed > 0) await touchTrip(tx, tripId);
    }, PHOTO_TX_OPTIONS);
  }

  /** 앱이 올렸다고 한 파일이 정말 있고, 서명한 형식과 크기 안인지. */
  private async ensureUploaded(key: string, maxBytes: number): Promise<void> {
    const file = await this.storage.stat(key);
    if (!file) {
      throw new ConflictException('사진 파일이 아직 올라오지 않았습니다');
    }
    if (file.contentType !== PHOTO_CONTENT_TYPE || file.size > maxBytes) {
      throw new ConflictException('사진 파일의 형식이나 크기가 틀립니다');
    }
  }

  /** 내 여행의 장소. 없거나 남의 장소, 휴지통 여행의 장소면 404. */
  private async findOwnedStop(userId: string, stopId: string) {
    const stop = await this.prisma.stop.findFirst({
      where: { id: stopId, trip: { userId, deletedAt: null } },
      select: { tripId: true },
    });
    if (!stop) throw new NotFoundException();
    return stop;
  }
}
