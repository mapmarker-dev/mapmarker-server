import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Env, NodeEnv } from './config/env';

/**
 * 앱 전역 설정. `main.ts`와 e2e 테스트가 같이 불러서, 테스트가 실제로 도는 설정 그대로 확인한다.
 */
export function configureApp(app: INestApplication): void {
  // DTO에 없는 필드는 거절하고, 경로·쿼리 값은 DTO 타입으로 바꾼다.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 경로 앞에 /v1을 붙인다. 깔린 앱은 바로 업데이트되지 않아서, 깨지는 변경은 새 버전으로 낸다.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  if (config.get('NODE_ENV', { infer: true }) !== NodeEnv.Production) {
    setupSwagger(app);
  }
}

/** API 문서: /docs (화면), /docs-json (OpenAPI JSON). */
function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('MapMarker API')
      .setDescription('MapMarker 앱 서버 API')
      .setVersion('1')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);
}
