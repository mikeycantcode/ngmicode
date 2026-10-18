import * as YAML from '../../src/index.ts'
import { source } from '../_utils.ts'

describe('No extra whitespace for empty values', () => {
  test('Single newline after key with empty value', () => {
    const src = source`
      map:
        item:

      anothermap:
        anotheritem:

      `
    const doc = YAML.parseDocument(src)
    expect(String(doc)).toBe(src)
  })
})
