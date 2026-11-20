import { returnBalanceMillimes } from "./accounts";
import { seedBillingFixtures } from "./fixtures/billing";
import { INVOICES, type Invoice } from "./invoice-model";
import { readTable } from "./mock-db";

/**
 * What an account owes GOFAST, in millimes: the amounts still due on its invoices (stored on each
 * invoice, never computed from lines) plus its return balance (R605). The one reader for every
 * screen that shows an amount due (C01, C04) and for the account closing (R105, PR B): RV-15.
 */
export function amountDueMillimes(accountId: string): number {
  seedBillingFixtures();
  const invoices = Object.values(readTable<Invoice>(INVOICES)).filter(
    (invoice) => invoice.customerId === accountId,
  );
  return (
    invoices.reduce((sum, invoice) => sum + invoice.dueMillimes, 0) +
    returnBalanceMillimes(accountId)
  );
}
