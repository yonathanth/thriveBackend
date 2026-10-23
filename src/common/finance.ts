/**
 * Income that counts as revenue, as the desktop dashboard counts it: income that was
 * not cancelled, refunded or left pending. A missing status is a paid one.
 */
export function paidIncome(alias: string): string {
  return (
    `(${alias}.transactionType = 'income' AND ` +
    `COALESCE(${alias}.paymentStatus, 'paid') NOT IN ('cancelled', 'refunded', 'pending'))`
  );
}

/**
 * What a payment was for, as the desktop's "revenue by source" names it: add-ons and
 * drop-ins by what was sold, everything else by the membership's category.
 */
export function revenueSource(alias: string, serviceAlias: string): string {
  return (
    `CASE WHEN ${alias}.additionalServiceLocalId IS NOT NULL THEN 'Add-ons' ` +
    `WHEN ${alias}.usageServiceLocalId IS NOT NULL THEN 'Drop-ins' ` +
    `ELSE COALESCE(${serviceAlias}.category, 'Other') END`
  );
}
