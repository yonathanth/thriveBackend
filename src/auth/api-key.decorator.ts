import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

export function ApiKey() {
  return applyDecorators(UseGuards(ApiKeyGuard));
}




