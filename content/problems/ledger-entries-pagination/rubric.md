## Intended approach
Find the handler (`api/handlers/accounts.ts#listEntries`) and the TODO. Note that
`JournalRepo.listForAccount` already sorts by `(postedAt, id)` via `compareEntries`, and that
ids are zero-padded so they sort lexicographically. Design a **keyset** cursor encoding
`(postedAt, id)` of the last returned entry, and resume strictly after it. Reuse
`queryInt` for `limit` and the config page sizes (thread `config` to the handler, or import
`DEFAULT_CONFIG`; discuss the trade-off). Validate the cursor strictly. Return
`nextCursor: null` when no entries remain.

## Key files
- `src/api/handlers/accounts.ts`
- `src/storage/repos.ts` (`JournalRepo.listForAccount`), `src/domain/journal.ts` (`compareEntries`)
- `src/api/validate.ts` (`queryInt`), `src/config.ts` (page sizes)

## Traps
- **Offset pagination** (`cursor = index`): a back-dated entry inserted before the
  cursor shifts everything, so the next page repeats an entry.
- **Timestamp-only cursor**: entries sharing a `postedAt` get skipped or duplicated
  at page boundaries. Needs the id tie-break.
- **Off-by-one on `nextCursor`**: returning a cursor when the page is exactly the last
  `limit` items is fine only if the next call returns an empty page with `null`. Better is to
  return `null` directly.
- **Lenient parsing**: `Number("abc")` → NaN slipping through; `limit=0`; `limit=201`.
- **Changing the entry shape** or breaking `data` for existing clients.

## Strong signals
- Explains why keyset beats offset for an append-mostly ledger with back-dated writes.
- Mentions that the cursor format is versioned/opaque so it can change later (date filters).
- Tests ties and concurrent inserts explicitly.

## Weak signals
- Accepts offset pagination ("good enough").
- Doesn't test boundary limits or malformed cursors.

## Follow-up questions
- A back-dated entry lands *before* the cursor while a partner is paging. They never see it. Is that acceptable for reconciliation? How would you surface it?
- How would you add `from`/`to` filters without breaking existing cursors?
- Should cursors be signed or encrypted? What could a client do by forging one?
- `listForAccount` still loads every entry into memory. How would you push the keyset into storage?
