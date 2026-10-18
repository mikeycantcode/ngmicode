// From superstruct PR #945: test/validation/bigint/{valid,invalid,invalid-number}.ts
import { describe, it } from 'vitest'
import { bigint } from '../../src'
import { checkFixture } from '../../test/support/run-fixture'

describe('bigint', () => {
  it('valid', () => {
    checkFixture('bigint/valid', { Struct: bigint(), data: 542n, output: 542n })
  })

  it('invalid', () => {
    const data = 'invalid'
    checkFixture('bigint/invalid', {
      Struct: bigint(),
      data,
      failures: [
        { value: 'invalid', type: 'bigint', refinement: undefined, path: [], branch: [data] },
      ],
    })
  })

  it('invalid-number', () => {
    const data = 3
    checkFixture('bigint/invalid-number', {
      Struct: bigint(),
      data,
      failures: [
        { value: 3, type: 'bigint', refinement: undefined, path: [], branch: [data] },
      ],
    })
  })
})
