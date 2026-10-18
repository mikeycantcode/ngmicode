import { describe, expect, it } from 'vitest'
import {
  type,
  optional,
  create,
  string,
  defaulted,
} from '../../src'

describe('create', () => {
  it('missing as helper', () => {
    const S = defaulted(string(), 'default')
    expect(create(undefined, S)).toBe('default')
  })

  it('missing as method', () => {
    const S = defaulted(string(), 'default')
    expect(S.create(undefined)).toBe('default')
  })

  it('not missing as helper', () => {
    const S = defaulted(string(), 'default')
    expect(create('string', S)).toBe('string')
  })

  it('not missing as method', () => {
    const S = defaulted(string(), 'default')
    expect(S.create('string')).toBe('string')
  })

  it('optional fields not undefined', () => {
    const S = type({
      a: string(),
      b: optional(string()),
      c: optional(type({ d: string() })),
    })
    expect(S.create({ a: 'a' })).toStrictEqual({ a: 'a' })
  })

  it('custom error message', () => {
    expect(() => string().create(42, 'Not a string!')).toThrow(
      expect.objectContaining({
        cause: 'Expected a string, but received: 42',
        message: 'Not a string!',
      })
    )
  })
})
