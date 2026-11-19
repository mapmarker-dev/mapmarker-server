import {
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DeleteObjectsCommand,
  DeleteObjectTaggingCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  PENDING_TAG,
  PHOTO_CONTENT_TYPE,
  PhotoStorage,
  PresignedUpload,
  StoredFile,
} from './photo-storage';

/** DeleteObjects 한 번에 지울 수 있는 키 수(S3 한도). */
const DELETE_BATCH = 1000;

/** S3 클라이언트 설정. 서버 요청 안에서 부르므로 오래 기다리지 않는다. */
export interface S3ClientOptions {
  region: string;
  /** `~/.aws/credentials`의 프로필 이름. 없으면 기본 순서(환경 변수, 기본 프로필, EC2 역할)로 찾는다. */
  profile?: string;
}

export function createS3Client({ region, profile }: S3ClientOptions): S3Client {
  return new S3Client({
    region,
    // 빈 문자열도 "프로필 없음"으로 본다(.env의 `AWS_PROFILE=`).
    profile: profile || undefined,
    // 기본값(WHEN_SUPPORTED)이면 서명 주소에 빈 본문의 CRC32가 들어가 실제 파일을 올리면 S3가 거절한다.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 3000, requestTimeout: 5000 },
  });
}

/** [PhotoStorage]의 S3 구현. 서명은 서버 안에서 계산만 하고, 확인·태그·삭제만 S3에 요청한다. */
export class S3PhotoStorage extends PhotoStorage {
  private readonly logger = new Logger(S3PhotoStorage.name);

  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {
    super();
  }

  async presignUpload(
    key: string,
    contentLength: number,
    expiresInSeconds: number,
  ): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: PHOTO_CONTENT_TYPE,
      ContentLength: contentLength,
      Tagging: PENDING_TAG,
    });
    const url = await this.sign(() =>
      getSignedUrl(this.client, command, {
        expiresIn: expiresInSeconds,
        // 형식과 태그도 서명에 넣어, 앱이 다른 형식으로 올리거나 태그를 빼면 S3가 거절하게 한다.
        // 태그는 주소(쿼리)로 옮기지 않고 헤더로 둔다.
        signableHeaders: new Set(['content-type', 'content-length']),
        unhoistableHeaders: new Set(['x-amz-tagging']),
      }),
    );
    return {
      url,
      headers: {
        'Content-Type': PHOTO_CONTENT_TYPE,
        'Content-Length': String(contentLength),
        'x-amz-tagging': PENDING_TAG,
      },
    };
  }

  presignDownload(key: string, expiresInSeconds: number): Promise<string> {
    return this.sign(() =>
      getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: expiresInSeconds },
      ),
    );
  }

  async stat(key: string): Promise<StoredFile | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        size: head.ContentLength ?? 0,
        contentType: head.ContentType ?? null,
      };
    } catch (error) {
      if (statusOf(error) === 404) return null;
      throw this.failure('파일 확인', error);
    }
  }

  async markUploaded(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectTaggingCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      throw this.failure('태그 떼기', error);
    }
  }

  async deleteMany(keys: readonly string[]): Promise<void> {
    for (let start = 0; start < keys.length; start += DELETE_BATCH) {
      const batch = keys.slice(start, start + DELETE_BATCH);
      let failed: number;
      try {
        const result = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
          }),
        );
        failed = result.Errors?.length ?? 0;
        if (failed > 0) {
          this.logger.error(
            `S3 파일 ${failed}개를 지우지 못했습니다: ${result.Errors?.[0]?.Code}`,
          );
        }
      } catch (error) {
        throw this.failure('파일 지우기', error);
      }
      // 일부만 실패하면 다시 지우면 된다(없는 키는 지운 것으로 본다).
      if (failed > 0) throw new ServiceUnavailableException();
    }
  }

  /** 서명은 S3에 요청하지 않지만 자격 증명을 읽는다. 못 읽으면 서버 설정 문제라 500이다. */
  private async sign(signer: () => Promise<string>): Promise<string> {
    try {
      return await signer();
    } catch (error) {
      this.logger.error('S3 주소에 서명하지 못했습니다(자격 증명 확인)', error);
      throw new InternalServerErrorException();
    }
  }

  /**
   * 닿지 못했거나(상태 코드 없음) S3가 잠시 실패했으면(5xx, 호출 과다) 503,
   * 권한·버킷·자격 증명이 틀렸으면(그 밖의 4xx) 서버 설정 문제라 500으로 바꾼다.
   */
  private failure(action: string, error: unknown): Error {
    const status = statusOf(error);
    if (status === undefined || status >= 500 || status === 429) {
      this.logger.warn(`S3 ${action}에 실패했습니다: ${describe(error)}`);
      return new ServiceUnavailableException();
    }
    this.logger.error(`S3 ${action}가 거절됐습니다: ${describe(error)}`);
    return new InternalServerErrorException();
  }
}

function statusOf(error: unknown): number | undefined {
  if (error instanceof S3ServiceException) {
    return error.$metadata.httpStatusCode;
  }
  return undefined;
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  return String(error);
}
