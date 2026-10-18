// From superstruct PR #1126: test/api/create.ts (renamed + added cases)
import { describe, expect, it } from 'vitest'
import { type, optional, string, literal, coerce } from '../../src'

describe('create', () => {
  it('missing optional fields remain missing', () => {
    const S = type({
      a: string(),
      b: optional(string()),
      c: optional(type({ d: string() })),
    })
    expect(S.create({ a: 'a' })).toStrictEqual({ a: 'a' })
  })

  it('explicit undefined values are kept', () => {
    const S = type({
      a: string(),
      b: coerce(optional(string()), literal(null), () => undefined),
      c: optional(type({ d: string() })),
    })
    expect(S.create({ a: 'a', b: null, c: undefined })).toStrictEqual({
      a: 'a',
      b: undefined,
      c: undefined,
    })
  })
})
