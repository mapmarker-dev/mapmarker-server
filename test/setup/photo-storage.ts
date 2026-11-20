import { ServiceUnavailableException } from '@nestjs/common';
import { TestingModuleBuilder } from '@nestjs/testing';
import {
  PENDING_TAG,
  PHOTO_CONTENT_TYPE,
  PhotoStorage,
  PresignedUpload,
  StoredFile,
} from '../../src/storage/photo-storage';

/** 메모리에 둔 파일 하나. */
interface FakeFile extends StoredFile {
  /** 등록 전 태그가 붙어 있는지. */
  pending: boolean;
}

/**
 * 실제 S3 대신 쓰는 메모리 저장소. 앱이 업로드 주소로 올리는 것은 [upload]로 흉내 낸다.
 * 주소는 `fake-s3://<키>?...` 모양이라 어떤 키에 서명했는지 테스트가 볼 수 있다.
 */
export class FakePhotoStorage extends PhotoStorage {
  readonly files = new Map<string, FakeFile>();
  /** 서명한 업로드 주소(키와 바이트 수). */
  readonly uploads: { key: string; contentLength: number }[] = [];
  /** true면 S3에 닿지 못한다(503). 서명은 계속 된다(서버 안에서 계산해서). */
  down = false;

  presignUpload(
    key: string,
    contentLength: number,
    expiresInSeconds: number,
  ): Promise<PresignedUpload> {
    this.uploads.push({ key, contentLength });
    return Promise.resolve({
      url: `fake-s3://${key}?put&expires=${expiresInSeconds}`,
      headers: {
        'Content-Type': PHOTO_CONTENT_TYPE,
        'Content-Length': String(contentLength),
        'x-amz-tagging': PENDING_TAG,
      },
    });
  }

  presignDownload(key: string, expiresInSeconds: number): Promise<string> {
    return Promise.resolve(`fake-s3://${key}?get&expires=${expiresInSeconds}`);
  }

  stat(key: string): Promise<StoredFile | null> {
    if (this.down) return this.unavailable();
    const file = this.files.get(key);
    return Promise.resolve(
      file ? { size: file.size, contentType: file.contentType } : null,
    );
  }

  markUploaded(key: string): Promise<void> {
    if (this.down) return this.unavailable();
    const file = this.files.get(key);
    if (file) file.pending = false;
    return Promise.resolve();
  }

  deleteMany(keys: readonly string[]): Promise<void> {
    if (this.down) return this.unavailable();
    for (const key of keys) this.files.delete(key);
    return Promise.resolve();
  }

  /** 앱이 업로드 주소로 올린 것처럼 파일을 둔다(등록 전 태그가 붙는다). */
  upload(
    key: string,
    size = 1000,
    contentType: string | null = PHOTO_CONTENT_TYPE,
  ): void {
    this.files.set(key, { size, contentType, pending: true });
  }

  /** 남아 있는 키(정렬). */
  keys(): string[] {
    return [...this.files.keys()].sort();
  }

  private unavailable(): Promise<never> {
    return Promise.reject(new ServiceUnavailableException());
  }
}

/** 사진 저장소를 [fake]로 바꿔 끼운다. 사진을 만들거나 지우는 e2e는 이것을 거친다. */
export function withFakePhotoStorage(
  builder: TestingModuleBuilder,
  fake = new FakePhotoStorage(),
): TestingModuleBuilder {
  return builder.overrideProvider(PhotoStorage).useValue(fake);
}
