import { describe, expect, test } from 'vitest';
import {
  stringifyJson,
  type StringifyJsonIssue,
} from '../../src/actions/stringifyJson/stringifyJson.ts';

// Cases added/changed by open-circle/valibot#1476.
describe('stringifyJson', () => {
  describe('should return dataset with issues', () => {
    const action = stringifyJson(undefined, 'message');
    const baseIssue: Omit<StringifyJsonIssue<unknown>, 'input' | 'received'> = {
      kind: 'transformation',
      type: 'stringify_json',
      expected: null,
      message: 'message',
      requirement: undefined,
      path: undefined,
      issues: undefined,
      lang: undefined,
      abortEarly: undefined,
      abortPipeEarly: undefined,
    };

    test('for function input', () => {
      const input = () => null;
      expect(action['~run']({ typed: true, value: input }, {})).toStrictEqual({
        typed: false,
        value: input,
        issues: [
          {
            ...baseIssue,
            input,
            received: 'Function',
          },
        ],
      });
    });

    test('for symbol input', () => {
      const input = Symbol('test');
      expect(action['~run']({ typed: true, value: input }, {})).toStrictEqual({
        typed: false,
        value: input,
        issues: [
          {
            ...baseIssue,
            input,
            received: 'symbol',
          },
        ],
      });
    });
  });
});
