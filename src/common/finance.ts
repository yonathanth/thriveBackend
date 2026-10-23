/** The moment website finances start (Admin > Settings), or no limit when unset. */
const FINANCE_SINCE = `COALESCE((SELECT ss."value"::timestamptz FROM site_setting ss WHERE ss."key" = 'finance_start_at'), '-infinity'::timestamptz)`;

/**
 * Records counted in website finances: on or after the finance start date. For
 * TypeORM query builders (property names).
 */
export function countedFinance(alias: string): string {
  return `(${alias}.transactionDate >= ${FINANCE_SINCE})`;
}

/** The same, for raw SQL (column names). */
export function countedFinanceRaw(alias: string): string {
  return `(${alias}."transactionDate" >= ${FINANCE_SINCE})`;
}

/**
 * Income that counts as revenue, as the desktop dashboard counts it: income that was
 * not cancelled, refunded or left pending. A missing status is a paid one.
 */
export function paidIncome(alias: string): string {
  return (
    `(${alias}.transactionType = 'income' AND ` +
    `COALESCE(${alias}.paymentStatus, 'paid') NOT IN ('cancelled', 'refunded', 'pending') AND ` +
    `${countedFinance(alias)})`
  );
}

/**
 * What a payment was for, as the desktop's "revenue by source" names it: add-ons,
 * drop-ins and inventory sales by what was sold, everything else by the membership's
 * category.
 */
export function revenueSource(alias: string, serviceAlias: string): string {
  return (
    `CASE WHEN ${alias}.stockCountLocalId IS NOT NULL THEN 'Inventory' ` +
    `WHEN ${alias}.additionalServiceLocalId IS NOT NULL THEN 'Add-ons' ` +
    `WHEN ${alias}.usageServiceLocalId IS NOT NULL THEN 'Drop-ins' ` +
    `ELSE COALESCE(${serviceAlias}.category, 'Other') END`
  );
}
