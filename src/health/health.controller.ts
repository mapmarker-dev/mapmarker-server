import {
  Controller,
  Get,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { HealthResponse } from './dto/health-response.dto';
import { HealthService } from './health.service';

/** 상태 확인. 로드밸런서가 부를 주소라 API 버전(/v1)을 붙이지 않고, 토큰 없이 연다. */
@Public()
@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOkResponse({ type: HealthResponse })
  @ApiServiceUnavailableResponse({ description: 'DB에 연결할 수 없음' })
  async check(): Promise<HealthResponse> {
    const health = await this.healthService.check();
    if (health.database === 'down') {
      throw new ServiceUnavailableException(health);
    }
    return health;
  }
}
