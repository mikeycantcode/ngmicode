import * as YAML from '../../src/index.ts'

// Adapted from the PR's tests: the original used `toMatchObject(_map(...))`,
// which relies on vitest's Map-aware matching. These assertions check the same
// structure pair by pair.
function pairsOf(doc: YAML.Document) {
  expect(doc.value).toBeInstanceOf(YAML.YAMLMap)
  return Array.from((doc.value as YAML.YAMLMap).values.values())
}

function expectSeqKey3To4(pair: any) {
  expect(pair.key).toBeInstanceOf(YAML.YAMLSeq)
  expect(Array.from(pair.key)).toMatchObject([{ value: 3 }])
  expect(pair.value).toMatchObject({ value: 4 })
}

describe('flow collection keys', () => {
  test('flow collection key after a blank line (#646)', () => {
    const doc = YAML.parseDocument('1: 2\n\n[3]: 4')
    expect(doc.errors).toHaveLength(0)
    const pairs = pairsOf(doc)
    expect(pairs).toHaveLength(2)
    expect(pairs[0]).toMatchObject({ key: { value: 1 }, value: { value: 2 } })
    expectSeqKey3To4(pairs[1])
  })

  test('flow collection key after a comment line (#646)', () => {
    const doc = YAML.parseDocument('1: 2\n# c\n[3]: 4')
    expect(doc.errors).toHaveLength(0)
    const pairs = pairsOf(doc)
    expect(pairs).toHaveLength(2)
    expect(pairs[0]).toMatchObject({ key: { value: 1 }, value: { value: 2 } })
    expectSeqKey3To4(pairs[1])
  })

  test('flow collection key after an empty explicit key (#646)', () => {
    const doc = YAML.parseDocument('?\n[3]: 4')
    expect(doc.errors).toHaveLength(0)
    const pairs = pairsOf(doc)
    expect(pairs).toHaveLength(2)
    expect(pairs[0]).toMatchObject({ key: { value: null }, value: null })
    expectSeqKey3To4(pairs[1])
  })
})
