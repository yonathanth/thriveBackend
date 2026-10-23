/**
 * Ethiopian mobile numbers to one form, +2519XXXXXXXX or +2517XXXXXXXX, so a login
 * matches however the desktop or the user typed it (09.., 9.., 2519.., +2519..,
 * 002519.., with spaces or dashes). Anything else is not a usable login: null.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.trim().replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  if (!/^\d+$/.test(digits)) return null;

  let national: string;
  if (digits.length === 12 && digits.startsWith('251'))
    national = digits.slice(3);
  else if (digits.length === 10 && digits.startsWith('0'))
    national = digits.slice(1);
  else if (digits.length === 9) national = digits;
  else return null;

  return /^[79]\d{8}$/.test(national) ? `+251${national}` : null;
}
