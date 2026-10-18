import { describe, expect, test } from 'vitest';
import * as v from '../../src/index.ts';

// Cases from open-circle/valibot#1457 (to*Case.test.ts and _formatCase.test.ts),
// exercised through the public package entry point.
const run = (action: { '~run': Function }, value: string) =>
  action['~run']({ typed: true, value }, {}).value;

describe('case transformation actions', () => {
  test('toCamelCase', () => {
    const action = v.toCamelCase();
    expect(action).toStrictEqual({
      kind: 'transformation',
      type: 'to_camel_case',
      reference: v.toCamelCase,
      async: false,
      '~run': expect.any(Function),
    });
    expect(run(action, '')).toBe('');
    expect(run(action, 'Hello')).toBe('hello');
    expect(run(action, 'hello_world')).toBe('helloWorld');
    expect(run(action, 'HELLO_WORLD')).toBe('helloWorld');
    expect(run(action, 'helloWorld')).toBe('helloWorld');
    expect(run(action, 'parseURLValue')).toBe('parseUrlValue');
    expect(run(action, 'XMLHttpRequest')).toBe('xmlHttpRequest');
    expect(run(action, 'IOError')).toBe('ioError');
    expect(run(action, 'iPhone')).toBe('iPhone');
    expect(run(action, 'item2Name')).toBe('item2Name');
    expect(run(action, 'HTTP2')).toBe('http2');
    expect(run(action, 'OAuth2Token')).toBe('oAuth2Token');
    expect(run(action, 'foo_\u{10428}pple')).toBe('foo\u{10400}pple');
  });

  test('toPascalCase', () => {
    const action = v.toPascalCase();
    expect(action).toStrictEqual({
      kind: 'transformation',
      type: 'to_pascal_case',
      reference: v.toPascalCase,
      async: false,
      '~run': expect.any(Function),
    });
    expect(run(action, 'hello')).toBe('Hello');
    expect(run(action, 'HELLO')).toBe('Hello');
    expect(run(action, 'helloWorld')).toBe('HelloWorld');
    expect(run(action, 'HelloWorld')).toBe('HelloWorld');
    expect(run(action, 'URLParser')).toBe('UrlParser');
    expect(run(action, 'Foo2Bar')).toBe('Foo2Bar');
    expect(run(action, 'CAFÉ')).toBe('Café');
    expect(run(action, '\u{10428}pple_world')).toBe('\u{10400}ppleWorld');
  });

  test('toSnakeCase', () => {
    const action = v.toSnakeCase();
    expect(action).toStrictEqual({
      kind: 'transformation',
      type: 'to_snake_case',
      reference: v.toSnakeCase,
      async: false,
      '~run': expect.any(Function),
    });
    expect(run(action, 'helloWorld')).toBe('hello_world');
    expect(run(action, 'hello-world')).toBe('hello_world');
    expect(run(action, 'parseURLValue')).toBe('parse_url_value');
    expect(run(action, 'item2Name')).toBe('item2_name');
    expect(run(action, 'OAuth2Token')).toBe('o_auth2_token');
    expect(run(action, '--foo__bar--')).toBe('foo_bar');
    expect(run(action, 'foo\tbar\nbaz')).toBe('foo_bar_baz');
    expect(run(action, '\t\n\r\v\f')).toBe('');
    expect(run(action, 'aBCd')).toBe('a_b_cd');
    expect(run(action, '123ABC')).toBe('123_abc');
    expect(run(action, 'foo.bar')).toBe('foo.bar');
    expect(run(action, 'ÜBer')).toBe('ü_ber');
    expect(run(action, 'V2_API_token')).toBe('v2_api_token');
    expect(run(action, 'PDFLoader')).toBe('pdf_loader');
  });

  test('toKebabCase inside a pipe', () => {
    const action = v.toKebabCase();
    expect(action).toStrictEqual({
      kind: 'transformation',
      type: 'to_kebab_case',
      reference: v.toKebabCase,
      async: false,
      '~run': expect.any(Function),
    });
    const Schema = v.pipe(v.string(), v.toKebabCase());
    expect(v.parse(Schema, 'helloWorld')).toBe('hello-world');
    expect(v.parse(Schema, 'hello_world')).toBe('hello-world');
    expect(v.parse(Schema, 'hello-world')).toBe('hello-world');
    expect(v.parse(Schema, 'parseURLValue')).toBe('parse-url-value');
    expect(v.parse(Schema, 'mixedCASE_with-various separators')).toBe(
      'mixed-case-with-various-separators'
    );
  });
});
