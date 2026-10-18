// Migration helper for the old spreadsheet-based ledger. Format, one per line:
//   2023-12-31,Opening balance,1000,3000,1250.00,USD
//   date,description,debit account code,credit account code,amount (decimal),currency
// Lines starting with # are comments. Will be deleted after the Q3 migration.
import { ValidationError } from "../domain/errors";
import { credit, debit, EntryDraft } from "../domain/journal";
import { fromDecimal } from "../domain/money";
import { err, ok, partition, Result } from "../lib/result";
import { parseIso } from "../lib/time";
import type { Services } from "../services";

export interface CsvImportReport {
  imported: number;
  errors: { line: number; message: string }[];
}

export function parseLegacyCsv(services: Services, tenantId: string, csv: string): Result<EntryDraft, { line: number; message: string }>[] {
  const out: Result<EntryDraft, { line: number; message: string }>[] = [];
  csv.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    try {
      const [date, description, debitCode, creditCode, amount, currency] = line.split(",").map((s) => s.trim());
      if (!currency) throw new ValidationError("expected 6 columns");
      const dr = services.repos.accounts.findByCode(tenantId, debitCode);
      const cr = services.repos.accounts.findByCode(tenantId, creditCode);
      if (!dr || !cr) throw new ValidationError(`unknown account code ${!dr ? debitCode : creditCode}`);
      const m = fromDecimal(Number(amount), currency); // legacy float parse, see money.ts
      out.push(
        ok({
          tenantId,
          description,
          postedAt: parseIso(date, "date"),
          postings: [debit(dr.id, m), credit(cr.id, m)],
          metadata: { source: "legacy-csv", line: String(i + 1) },
        }),
      );
    } catch (e) {
      out.push(err({ line: i + 1, message: e instanceof Error ? e.message : String(e) }));
    }
  });
  return out;
}

export function importLegacyCsv(services: Services, tenantId: string, csv: string): CsvImportReport {
  const { values, errors } = partition(parseLegacyCsv(services, tenantId, csv));
  if (errors.length) return { imported: 0, errors };
  const entries = services.journal.importEntries(values);
  return { imported: entries.length, errors: [] };
}
