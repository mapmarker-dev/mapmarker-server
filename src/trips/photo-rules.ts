import type { Prisma, Stop } from '../generated/prisma/client';
import type { PhotoStorage } from '../storage/photo-storage';

/**
 * 사진 규칙. 장소마다 1장이고(서비스가 지킨다), 앱이 줄인 원본과 썸네일을 S3에 함께 올린다.
 * 키는 `users/{userId}/trips/{tripId}/photos/{photoId}.jpg`와 `…/{photoId}_thumb.jpg`(`.github` OVERVIEW).
 * DB에는 원본 키만 두고 썸네일 키는 거기서 만든다.
 */

/** 원본(앱이 긴 변 1920px로 줄인 JPEG, 비율 그대로)의 최대 바이트 수. */
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
/** 썸네일(앱에서 사용자가 고른 정사각형 400×400)의 최대 바이트 수. */
export const THUMBNAIL_MAX_BYTES = 512 * 1024;

/** 업로드 주소의 유효 시간. 줄이기는 앱이 먼저 하므로 올리기만 하면 된다. */
export const UPLOAD_URL_SECONDS = 10 * 60;
/**
 * 사진 주소의 유효 시간. 앱은 앱으로 돌아올 때 여행을 다시 받아 새 주소를 얻는다.
 * 1-7에서 CloudFront 서명 주소로 바꿔도 응답 모양은 같다.
 */
export const DOWNLOAD_URL_SECONDS = 60 * 60;

/** S3에 요청하는 트랜잭션의 제한 시간. Prisma 기본(5초)은 S3 재시도를 담기에 짧다. */
export const PHOTO_TX_OPTIONS = { timeout: 15_000 };

export function photoKey(
  userId: string,
  tripId: string,
  photoId: string,
): string {
  return `users/${userId}/trips/${tripId}/photos/${photoId}.jpg`;
}

export function thumbnailKeyOf(storageKey: string): string {
  return storageKey.replace(/\.jpg$/, '_thumb.jpg');
}

/** 사진 하나의 파일 키(원본과 썸네일). */
export function filesOf(photo: { storageKey: string }): string[] {
  return [photo.storageKey, thumbnailKeyOf(photo.storageKey)];
}

/**
 * [where]에 맞는 사진을 S3에서 지우고 DB에서도 지운다. 지운 수를 돌려준다.
 * 장소·여행을 지우기 전에 트랜잭션 안에서 부른다(DB의 사진이 장소 지우기를 막는다, Restrict).
 * S3를 먼저 지워서, S3가 실패하면 트랜잭션이 되돌아가고 파일과 줄이 함께 남는다(다시 지우면 된다).
 */
export async function deletePhotos(
  tx: Prisma.TransactionClient,
  storage: PhotoStorage,
  where: Prisma.PhotoWhereInput,
): Promise<number> {
  const photos = await tx.photo.findMany({
    where,
    select: { id: true, storageKey: true },
  });
  if (photos.length === 0) return 0;
  await storage.deleteMany(photos.flatMap(filesOf));
  await tx.photo.deleteMany({
    where: { id: { in: photos.map((photo) => photo.id) } },
  });
  return photos.length;
}

/**
 * 장소를 동선에서 빼기 전에(지우기, 후보로 빼기) 그 장소의 사진을 정리한다.
 *
 * 같은 여행에서 좌표가 같은 장소(밤마다 넣은 연박 숙소, 처음과 끝이 같은 공항)는 사진 하나와 사진 방향을 함께 쓴다.
 * 그래서 같은 자리 장소가 남아 있고 그중 사진이 있는 장소가 없으면, 사진과 사진 방향을 동선에서 먼저 오는
 * 그 장소로 넘긴다. 같은 자리 장소가 없거나 이미 사진이 있으면 이 장소의 사진은 지운다(S3 파일부터).
 */
export async function releasePhotos(
  tx: Prisma.TransactionClient,
  storage: PhotoStorage,
  stop: Pick<Stop, 'id' | 'tripId' | 'latitude' | 'longitude' | 'photoSide'>,
): Promise<void> {
  const siblings = await tx.stop.findMany({
    where: {
      tripId: stop.tripId,
      latitude: stop.latitude,
      longitude: stop.longitude,
      id: { not: stop.id },
    },
    orderBy: [{ day: 'asc' }, { order: 'asc' }],
    select: { id: true, _count: { select: { photos: true } } },
  });
  const heir = siblings[0];
  const hasPhoto = (await tx.photo.count({ where: { stopId: stop.id } })) > 0;
  if (
    hasPhoto &&
    heir &&
    siblings.every((sibling) => sibling._count.photos === 0)
  ) {
    await tx.photo.updateMany({
      where: { stopId: stop.id },
      data: { stopId: heir.id },
    });
    await tx.stop.update({
      where: { id: heir.id },
      data: { photoSide: stop.photoSide },
    });
    return;
  }
  await deletePhotos(tx, storage, { stopId: stop.id });
}
