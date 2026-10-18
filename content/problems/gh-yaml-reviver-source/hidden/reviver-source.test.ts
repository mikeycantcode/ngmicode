import * as YAML from '../../src/index.ts'
import { Document, Scalar, stringify } from '../../src/index.ts'

describe('reviver', () => {
  test('MDN example', () => {
    const reviver = vi.fn((_key, value) => value)
    const src = '{"1": 1, "2": 2, "3": {"4": 4, "5": {"6": 6}}}'
    const obj = JSON.parse(src)
    YAML.parse(src, reviver)
    expect(reviver.mock.calls).toMatchObject([
      ['1', 1, { source: '1' }],
      ['2', 2, { source: '2' }],
      ['4', 4, { source: '4' }],
      ['6', 6, { source: '6' }],
      ['5', { 6: 6 }, {}],
      ['3', obj[3], {}],
      ['', obj, {}]
    ])
    expect(reviver.mock.instances).toMatchObject([
      obj,
      obj,
      obj[3],
      obj[3][5],
      obj[3],
      obj,
      { '': obj }
    ])
  })

  test('sequence', () => {
    const these: unknown[][] = []
    const reviver = vi.fn(function (this: any, key, value) {
      these.push(Array.from(key === '' ? this[''] : this))
      if (key === '0') return undefined
      if (key === '3') return 10
      return value
    })
    const src = '[ 2, 4, 6, 8 ]'
    const seq = YAML.parse(src, reviver)
    expect(seq).toBeInstanceOf(Array)
    expect(seq).toMatchObject([undefined, 4, 6, 10])
    expect(reviver.mock.calls).toMatchObject([
      ['0', 2, { source: '2' }],
      ['1', 4, { source: '4' }],
      ['2', 6, { source: '6' }],
      ['3', 8, { source: '8' }],
      ['', {}, {}]
    ])
    expect(these).toMatchObject([
      [2, 4, 6, 8],
      [undefined, 4, 6, 8],
      [undefined, 4, 6, 8],
      [undefined, 4, 6, 8],
      [undefined, 4, 6, 10]
    ])
  })

  test('!!merge simple', () => {
    const reviver = vi.fn((_key, value) => value)
    const src = '- &a { a: A, b: B }\n- { <<: *a, b: X }\n'
    YAML.parse(src, { merge: true, reviver })
    expect(reviver.mock.calls).toMatchObject([
      ['a', 'A', { source: 'A' }],
      ['b', 'B', { source: 'B' }],
      ['0', { a: 'A', b: 'B' }, {}],
      ['a', 'A', { source: 'A' }],
      ['b', 'X', { source: 'X' }],
      ['1', { a: 'A', b: 'X' }, {}],
      [
        '',
        [
          { a: 'A', b: 'B' },
          { a: 'A', b: 'X' }
        ],
        {}
      ]
    ])
  })

  test('!!merge recursion', () => {
    // Adapted from the PR's test: the original compares the self-referential
    // values with toMatchObject, which the sandbox matcher cannot traverse.
    const reviver = vi.fn((_key, value) => value)
    const src = '- &a { a: *a, b: B }\n- { <<: *a, b: X }\n'
    const res = YAML.parse(src, { merge: true, reviver })
    const aRef = res[0]
    expect(aRef.a).toBe(aRef)
    expect(aRef.b).toBe('B')
    expect(res[1].b).toBe('X')
    expect(res[1].a.b).toBe('B')
    expect(res[1].a.a.b).toBe('B')
    const calls = reviver.mock.calls
    expect(calls.map(c => c[0])).toEqual(['b', '0', 'b', 'a', 'b', '1', ''])
    expect(calls.map(c => c[2])).toMatchObject([
      { source: 'B' },
      {},
      { source: 'B' },
      {},
      { source: 'X' },
      {},
      {}
    ])
    expect(calls[1][1]).toBe(aRef)
    expect(calls[3][1]).toBe(res[1].a)
    expect(calls[5][1]).toBe(res[1])
    expect(calls[6][1]).toBe(res)
  })
})

describe.runIf(JSON.rawJSON)('stringify raw JSON', () => {
  test('quoted string', () => {
    const raw = '"Foo\\n bar"'
    const res = stringify(JSON.rawJSON(raw))
    expect(res).toBe(`${raw}\n`)
  })
})

describe.runIf(JSON.rawJSON)('node creation', () => {
  test('long number added to sequence', () => {
    const raw = '9'.repeat(99)
    const doc = new Document<any>([])
    doc.value.push(JSON.rawJSON(raw))
    expect(doc.value[0]).toBeInstanceOf(Scalar)
    expect(String(doc)).toBe(`- ${raw}\n`)
  })
})
