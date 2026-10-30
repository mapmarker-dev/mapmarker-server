// 데코레이터 타입 정보(@Type 등)를 읽는다. Nest 밖(단위 테스트)에서 불러도 동작하게 직접 불러온다.
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  Matches,
  Max,
  Min,
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
