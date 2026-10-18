// From superstruct PR #1252: test/validation/{object,record,type}/invalid-array.ts
import { describe, it } from 'vitest'
import { object, record, string, number, type } from '../../src'
import { checkFixture } from '../../test/support/run-fixture'

describe('arrays are not objects', () => {
  it('object() rejects an array', () => {
    const data: unknown[] = []
    checkFixture('object/invalid-array', {
      Struct: object(),
      data,
      failures: [
        { value: [], type: 'object', refinement: undefined, path: [], branch: [data] },
      ],
    })
  })

  it('record() rejects an array', () => {
    const data: unknown[] = []
    checkFixture('record/invalid-array', {
      Struct: record(string(), number()),
      data,
      failures: [
        { value: [], type: 'record', refinement: undefined, path: [], branch: [data] },
      ],
    })
  })

  it('type() rejects an array', () => {
    const data: unknown[] = []
    checkFixture('type/invalid-array', {
      Struct: type({}),
      data,
      failures: [
        { value: [], type: 'type', refinement: undefined, path: [], branch: [data] },
      ],
    })
  })
})
