// 데코레이터 타입 정보(@Type 등)를 읽는다. Nest 밖(단위 테스트)에서 불러도 동작하게 직접 불러온다.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/** 서버가 읽는 환경 변수. 시작할 때 검사해서, 빠졌거나 틀리면 서버가 뜨지 않는다. */
export class Env {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @Matches(/^postgres(ql)?:\/\//, {
    message: 'DATABASE_URL은 postgresql:// 주소여야 합니다',
  })
  DATABASE_URL: string;

  /** access 토큰 서명 키(HS256). 짧으면 대입 공격에 약해서 32자 이상만 받는다. */
  @IsString({ message: 'JWT_ACCESS_SECRET을 넣어 주세요' })
  @MinLength(32, { message: 'JWT_ACCESS_SECRET은 32자 이상이어야 합니다' })
  JWT_ACCESS_SECRET: string;

  /**
   * 카카오 네이티브 앱 키. 카카오 id_token의 aud(어느 앱을 위한 토큰인지)와 비교한다.
   * 앱에도 들어가는 값이라 비밀은 아니지만, 개발·운영 카카오 앱이 다를 수 있어 환경마다 둔다.
   */
  @IsString({ message: 'KAKAO_NATIVE_APP_KEY를 넣어 주세요' })
  @MinLength(1, { message: 'KAKAO_NATIVE_APP_KEY를 넣어 주세요' })
  KAKAO_NATIVE_APP_KEY: string;

  /** 행안부 도로명주소 검색 API 승인키. 비밀값이라 서버에만 둔다. */
  @IsString({ message: 'JUSO_ADDRESS_KEY를 넣어 주세요' })
  @MinLength(1, { message: 'JUSO_ADDRESS_KEY를 넣어 주세요' })
  JUSO_ADDRESS_KEY: string;

  /** 행안부 좌표제공 API 승인키. 도로명주소 검색 API와 따로 받는다. */
  @IsString({ message: 'JUSO_COORD_KEY를 넣어 주세요' })
  @MinLength(1, { message: 'JUSO_COORD_KEY를 넣어 주세요' })
  JUSO_COORD_KEY: string;

  /** 사진 버킷의 리전. */
  @IsString()
  @MinLength(1)
  AWS_REGION: string = 'ap-northeast-2';

  /**
   * `~/.aws/credentials`의 프로필 이름(로컬 개발). 키는 프로젝트 밖에 둔다.
   * 비우면 AWS 기본 순서(환경 변수, 기본 프로필, EC2 역할)로 찾는다. 운영(1-7)은 EC2 역할이라 비운다.
   */
  @IsOptional()
  @IsString()
  AWS_PROFILE?: string;

  /** 사진 버킷 이름. 값이 틀려도 서버는 뜨고 사진 요청만 실패한다. */
  @IsString({ message: 'S3_PHOTO_BUCKET을 넣어 주세요' })
  @MinLength(1, { message: 'S3_PHOTO_BUCKET을 넣어 주세요' })
  S3_PHOTO_BUCKET: string;
}

/** `ConfigModule`의 `validate`. 값은 환경 변수가 .env보다 우선한다. */
export function validateEnv(config: Record<string, unknown>): Env {
  const env = plainToInstance(Env, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(env);
  if (errors.length > 0) {
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
    throw new Error(
      `환경 변수가 올바르지 않습니다:\n- ${messages.join('\n- ')}`,
    );
  }
  return env;
}
