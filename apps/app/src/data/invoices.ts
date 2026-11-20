// حسابات الفاتورة. المبالغ بالهللة.
import { vatOf } from "@/lib/money";
import type { Invoice } from "./types";

export function invoiceTotals(inv: Invoice): { subtotal: number; vat: number; total: number } {
  const subtotal = inv.lines.reduce((sum, l) => sum + l.amountHalalas, 0);
  // الضريبة تُحسب على إجمالي الفاتورة مرة وحدة، مو على كل بند لحاله.
  const vat = vatOf(subtotal);
  return { subtotal, vat, total: subtotal + vat };
}
