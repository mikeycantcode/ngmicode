// From superstruct PR #1251: test/api/mask.test.ts (changed + added cases)
import { describe, expect, it } from 'vitest'
import { mask, object, string, defaulted, array, type, union } from '../../src'

describe('mask', () => {
  it('masking of a nested type', () => {
    const S = object({
      id: string(),
      sub: array(
        type({ prop: string(), defaultedProp: defaulted(string(), '42') })
      ),
      union: array(union([object({ prop: string() }), type({ k: string() })])),
    })
    const value = {
      id: '1',
      unknown: true,
      sub: [{ prop: '2', unknown: true }],
      union: [
        { prop: '3', unknown: true },
        { k: '4', unknown: true },
      ],
    }
    expect(mask(value, S)).toStrictEqual({
      id: '1',
      sub: [{ prop: '2', unknown: true, defaultedProp: '42' }],
      union: [{ prop: '3' }, { k: '4', unknown: true }],
    })
  })

  it('masking succeeds for objects with extra props in union', () => {
    const S = union([
      object({ a: string(), defaultedProp: defaulted(string(), '42') }),
      object({ b: string() }),
    ])
    const value = { a: '1', extraProp: 42 }
    expect(mask(value, S)).toStrictEqual({ a: '1', defaultedProp: '42' })
  })
})
