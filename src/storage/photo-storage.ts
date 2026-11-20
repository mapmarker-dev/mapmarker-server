/** 사진 파일 형식. 앱이 줄여서 JPEG로 올린다(위치 정보를 지운 다시 인코딩한 파일이다). */
export const PHOTO_CONTENT_TYPE = 'image/jpeg';

/**
 * 올리고 아직 등록하지 않은 파일에 붙이는 태그. S3 수명 주기 규칙이 이 태그가 붙은 파일을 하루 뒤 지운다.
 * 등록할 때 태그를 떼서 남긴다. 규칙은 버킷에 사람이 만든다(`.github` PLAN 1-3).
 */
export const PENDING_TAG = 'upload=pending';

/** 앱이 파일을 직접 올릴 주소. [headers]를 그대로 붙여 PUT으로 보낸다(서명에 들어가서 다르면 S3가 403). */
export interface PresignedUpload {
  url: string;
  headers: Record<string, string>;
}

/** 저장소에 있는 파일의 크기와 형식. */
export interface StoredFile {
  size: number;
  contentType: string | null;
}

/**
 * 사진 파일 저장소(S3). 서버는 파일을 직접 받지 않고 주소에 서명만 한다.
 * 테스트는 메모리 가짜(`test/setup/photo-storage.ts`)로 바꿔 끼워서 실제 AWS에 붙지 않는다.
 *
 * 닿지 못하거나 S3가 잠시 실패하면 503, 권한·버킷 설정이 틀리면 500(로그)이다.
 */
export abstract class PhotoStorage {
  /**
   * [key]에 [contentLength]바이트 JPEG를 올릴 주소. 형식, 바이트 수, [PENDING_TAG]가 서명에 들어간다.
   * 같은 키에 이미 파일이 있으면 덮어쓰므로, 부르는 쪽이 등록된 사진의 키가 아닌지 먼저 본다.
   */
  abstract presignUpload(
    key: string,
    contentLength: number,
    expiresInSeconds: number,
  ): Promise<PresignedUpload>;

  /** [key] 파일을 읽을 주소. */
  abstract presignDownload(
    key: string,
    expiresInSeconds: number,
  ): Promise<string>;

  /** [key] 파일의 크기와 형식. 없으면 null. */
  abstract stat(key: string): Promise<StoredFile | null>;

  /** 올린 파일을 등록한 것으로 표시한다([PENDING_TAG]를 뗀다). 떼지 않으면 하루 뒤 수명 주기 규칙이 지운다. */
  abstract markUploaded(key: string): Promise<void>;

  /** 파일들을 지운다. 없는 키는 지운 것으로 본다(여러 번 불러도 결과가 같다). */
  abstract deleteMany(keys: readonly string[]): Promise<void>;
}
