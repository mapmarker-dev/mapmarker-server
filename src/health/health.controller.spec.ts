import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  function controllerWith(
    result: Awaited<ReturnType<HealthService['check']>>,
  ): HealthController {
    return new HealthController({
      check: jest.fn().mockResolvedValue(result),
    } as unknown as HealthService);
  }

  it('DB가 up이면 상태를 그대로 돌려준다', async () => {
    const controller = controllerWith({ status: 'ok', database: 'up' });

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('DB가 down이면 503', async () => {
    const controller = controllerWith({ status: 'error', database: 'down' });

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
