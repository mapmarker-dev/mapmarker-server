import {
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DeleteObjectsCommand,
  DeleteObjectTaggingCommand,
  HeadObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { createS3Client, S3PhotoStorage } from './s3-photo-storage';

/** 서명은 서버 안에서 계산만 하고, 나머지 요청은 `client.send`를 가짜로 바꿔 실제 AWS에 붙지 않는다. */
describe('S3PhotoStorage', () => {
  const bucket = 'test-bucket';
  let client: S3Client;
  let storage: S3PhotoStorage;
  let send: jest.SpyInstance;

  beforeEach(() => {
    client = new S3Client({
      region: 'ap-northeast-2',
      // 테스트 전용 가짜 자격 증명. 서명 계산에만 쓴다.
      credentials: { accessKeyId: 'AKIDTEST', secretAccessKey: 'test-secret' },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    storage = new S3PhotoStorage(client, bucket);
    send = jest.spyOn(client, 'send');
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  function s3Error(status: number, name = 'Error'): S3ServiceException {
    return new S3ServiceException({
      name,
      $fault: status >= 500 ? 'server' : 'client',
      $metadata: { httpStatusCode: status },
    });
  }

  describe('업로드 주소', () => {
    it('형식, 바이트 수, 등록 전 태그를 서명하고 앱이 붙일 헤더를 함께 준다', async () => {
      const upload = await storage.presignUpload('users/u/p.jpg', 1234, 600);
      const url = new URL(upload.url);

      expect(url.host).toBe(`${bucket}.s3.ap-northeast-2.amazonaws.com`);
      expect(url.pathname).toBe('/users/u/p.jpg');
      expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
      expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe(
        'content-length;content-type;host;x-amz-tagging',
      );
      expect(upload.headers).toEqual({
        'Content-Type': 'image/jpeg',
        'Content-Length': '1234',
        'x-amz-tagging': 'upload=pending',
      });
    });

    it('빈 본문의 체크섬을 주소에 넣지 않는다 (넣으면 실제 파일을 S3가 거절한다)', async () => {
      // 서버가 쓰는 클라이언트 설정이 체크섬을 꼭 필요할 때만 넣는지.
      const real = createS3Client({ region: 'ap-northeast-2' });
      await expect(real.config.requestChecksumCalculation()).resolves.toBe(
        'WHEN_REQUIRED',
      );

      // 같은 설정의 클라이언트로 서명한 주소에 체크섬이 없는지.
      const upload = await storage.presignUpload('k.jpg', 10, 600);
      expect(upload.url).not.toContain('x-amz-checksum');
      expect(upload.url).not.toContain('x-amz-sdk-checksum');
    });
  });

  it('읽기 주소는 그 키에 유효 시간을 넣어 서명한다', async () => {
    const url = new URL(await storage.presignDownload('a/b.jpg', 3600));

    expect(url.pathname).toBe('/a/b.jpg');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
  });

  describe('파일 확인', () => {
    it('있으면 크기와 형식', async () => {
      send.mockResolvedValue({ ContentLength: 42, ContentType: 'image/jpeg' });

      await expect(storage.stat('k.jpg')).resolves.toEqual({
        size: 42,
        contentType: 'image/jpeg',
      });
      const command = send.mock.calls[0][0] as HeadObjectCommand;
      expect(command).toBeInstanceOf(HeadObjectCommand);
      expect(command.input).toEqual({ Bucket: bucket, Key: 'k.jpg' });
    });

    it('없으면(404) null', async () => {
      send.mockRejectedValue(s3Error(404, 'NotFound'));

      await expect(storage.stat('k.jpg')).resolves.toBeNull();
    });

    it('S3가 잠시 실패하거나(5xx) 닿지 못하면 503', async () => {
      send.mockRejectedValueOnce(s3Error(503, 'SlowDown'));
      await expect(storage.stat('k.jpg')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );

      send.mockRejectedValueOnce(new Error('ECONNRESET'));
      await expect(storage.stat('k.jpg')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('권한이 없으면(403) 서버 설정 문제라 500', async () => {
      send.mockRejectedValue(s3Error(403, 'Forbidden'));

      await expect(storage.stat('k.jpg')).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  it('등록하면 등록 전 태그를 뗀다', async () => {
    send.mockResolvedValue({});

    await storage.markUploaded('k.jpg');

    const command = send.mock.calls[0][0] as DeleteObjectTaggingCommand;
    expect(command).toBeInstanceOf(DeleteObjectTaggingCommand);
    expect(command.input).toEqual({ Bucket: bucket, Key: 'k.jpg' });
  });

  describe('지우기', () => {
    it('1000개씩 나눠 지운다', async () => {
      send.mockResolvedValue({});
      const keys = Array.from({ length: 1001 }, (_, i) => `k${i}.jpg`);

      await storage.deleteMany(keys);

      expect(send).toHaveBeenCalledTimes(2);
      const [first, second] = send.mock.calls.map(
        ([command]) => (command as DeleteObjectsCommand).input,
      );
      expect(first.Delete?.Objects).toHaveLength(1000);
      expect(second.Delete?.Objects).toEqual([{ Key: 'k1000.jpg' }]);
      expect(first.Delete?.Quiet).toBe(true);
    });

    it('지울 키가 없으면 요청하지 않는다', async () => {
      await storage.deleteMany([]);

      expect(send).not.toHaveBeenCalled();
    });

    it('일부를 지우지 못하면 503 (다시 지우면 된다)', async () => {
      send.mockResolvedValue({
        Errors: [{ Key: 'a.jpg', Code: 'InternalError' }],
      });

      await expect(storage.deleteMany(['a.jpg'])).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
