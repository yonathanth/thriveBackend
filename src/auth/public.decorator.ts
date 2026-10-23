import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as public — JWT auth is skipped for this handler.
 * Use for endpoints that must work without login (e.g. listing services on the marketing site).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
