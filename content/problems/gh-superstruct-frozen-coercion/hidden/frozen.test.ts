// From superstruct PR #1151: test/validation/{array,object,record,tuple,type}/valid-frozen.ts
import { describe, it } from 'vitest'
import { array, number, object, record, string, tuple, type } from '../../src'
import { checkFixture } from '../../test/support/run-fixture'

describe('create() with frozen input', () => {
  it('array', () => {
    checkFixture('array/valid-frozen', {
      Struct: array(number()),
      data: Object.freeze([1, 2, 3]),
      output: [1, 2, 3],
      create: true,
    })
  })

  it('object', () => {
    checkFixture('object/valid-frozen', {
      Struct: object({ name: string(), age: number() }),
      data: Object.freeze({ name: 'john', age: 42 }),
      output: { name: 'john', age: 42 },
      create: true,
    })
  })

  it('record', () => {
    checkFixture('record/valid-frozen', {
      Struct: record(string(), number()),
      data: Object.freeze({ a: 1, b: 2 }),
      output: { a: 1, b: 2 },
      create: true,
    })
  })

  it('tuple', () => {
    checkFixture('tuple/valid-frozen', {
      Struct: tuple([string(), number()]),
      data: Object.freeze(['A', 1]),
      output: ['A', 1],
      create: true,
    })
  })

  it('type', () => {
    checkFixture('type/valid-frozen', {
      Struct: type({ name: string(), age: number() }),
      data: Object.freeze({ name: 'john', age: 42 }),
      output: { name: 'john', age: 42 },
      create: true,
    })
  })
})
