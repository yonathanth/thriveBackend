import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

/** Same cost the admin login has always used. */
export const BCRYPT_ROUNDS = 10;

export const MIN_PASSWORD_LENGTH = 6;

/**
 * The temporary password given to provisioned and reset accounts. Read from env so it
 * is not hard-coded; every account holding it must change it at next login.
 */
export function defaultPassword(): string {
  return process.env.DEFAULT_PASSWORD || '0000';
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/** Rules for a password the account holder chooses. */
export function assertValidNewPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestException(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
  if (password === defaultPassword()) {
    throw new BadRequestException(
      'Choose a password other than the temporary one',
    );
  }
}
