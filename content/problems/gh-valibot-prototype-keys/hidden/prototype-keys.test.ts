import { describe, expect, test } from 'vitest';
import * as v from '../../src/index.ts';

// Behaviour from open-circle/valibot#1523: input keys named like Object.prototype
// members must be treated as unknown keys unless the schema declares them.
const PROTO_KEYS = ['toString', 'valueOf', 'hasOwnProperty', 'constructor'];
const DECLARED = [...PROTO_KEYS, 'prototype'];

describe('object schemas and Object.prototype key collisions', () => {
  test('strictObject and strictObjectAsync reject unknown prototype-named keys', async () => {
    for (const key of [...PROTO_KEYS, '__proto__']) {
      const input = { key: 'foo', [key]: 'bar' };
      for (const schema of [
        v.strictObject({ key: v.string() }),
        v.strictObjectAsync({ key: v.string() }),
      ]) {
        const dataset = await schema['~run']({ value: input }, {});
        expect(dataset.typed).toBe(false);
        expect(dataset.value).toStrictEqual({ key: 'foo' });
        expect(dataset.issues).toHaveLength(1);
        expect(dataset.issues?.[0]).toMatchObject({
          kind: 'schema',
          type: 'strict_object',
          input: key,
          expected: 'never',
          received: `"${key}"`,
          path: [{ type: 'object', origin: 'key', input, key, value: 'bar' }],
        });
      }
    }
    // Declared prototype-named entries still validate normally.
    for (const key of DECLARED) {
      const input = { [key]: 'foo' };
      expect(v.safeParse(v.strictObject({ [key]: v.string() }), input).success).toBe(true);
      expect((await v.safeParseAsync(v.strictObjectAsync({ [key]: v.string() }), input)).success).toBe(true);
    }
  });

  test('looseObject and looseObjectAsync pass unknown prototype-named keys through', async () => {
    for (const key of ['toString', 'valueOf', 'hasOwnProperty']) {
      const input = { key: 'foo', [key]: 'bar' };
      expect(v.parse(v.looseObject({ key: v.string() }), input)).toStrictEqual(input);
      expect(await v.parseAsync(v.looseObjectAsync({ key: v.string() }), input)).toStrictEqual(input);
    }
  });

  test('looseObject still excludes __proto__, constructor and prototype', async () => {
    const input = JSON.parse(
      '{"key":"foo","__proto__":{"admin":true},"constructor":"bar","prototype":"baz"}'
    );
    for (const schema of [
      v.looseObject({ key: v.string() }),
      v.looseObjectAsync({ key: v.string() }),
      v.objectWithRest({ key: v.string() }, v.number()),
      v.objectWithRestAsync({ key: v.string() }, v.number()),
    ]) {
      const dataset = await schema['~run']({ value: input }, {});
      expect(dataset).toStrictEqual({ typed: true, value: { key: 'foo' } });
      expect(Object.getPrototypeOf(dataset.value)).toBe(Object.prototype);
    }
  });

  test('objectWithRest and objectWithRestAsync validate prototype-named keys against rest', async () => {
    const valid = { key: 'foo', toString: 1, valueOf: 2, hasOwnProperty: 3 };
    for (const schema of [
      v.objectWithRest({ key: v.string() }, v.number()),
      v.objectWithRestAsync({ key: v.string() }, v.number()),
    ]) {
      expect(await schema['~run']({ value: valid }, {})).toStrictEqual({
        typed: true,
        value: valid,
      });
      for (const key of ['toString', 'valueOf', 'hasOwnProperty']) {
        const input = { key: 'foo', [key]: 'bar' };
        const dataset = await schema['~run']({ value: input }, {});
        expect(dataset.typed).toBe(false);
        expect(dataset.issues).toHaveLength(1);
        expect(dataset.issues?.[0]).toMatchObject({
          kind: 'schema',
          type: 'number',
          input: 'bar',
          expected: 'number',
          received: '"bar"',
          path: [{ type: 'object', origin: 'value', input, key, value: 'bar' }],
        });
      }
    }
  });
});
