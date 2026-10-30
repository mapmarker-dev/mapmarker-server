import { ApiProperty } from '@nestjs/swagger';

export class HealthResponse {
  @ApiProperty({ enum: ['ok', 'error'] })
  status: 'ok' | 'error';

  @ApiProperty({ enum: ['up', 'down'] })
  database: 'up' | 'down';
}
