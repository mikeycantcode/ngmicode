import * as YAML from '../../src/index.ts'

describe('plain implicit keys', () => {
  test('plain key containing flow indicators', () => {
    const doc = YAML.parseDocument('foo[{}]: bar')
    expect(doc.toString()).toBe('foo[{}]: bar\n')
  })
})
