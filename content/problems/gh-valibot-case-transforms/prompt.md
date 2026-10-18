# Naming-convention transforms: `toCamelCase` & friends

You are joining the **valibot** team. Valibot is a modular schema validation library: schemas
(`string()`, `object()`, …) are composed with validation and transformation **actions**
inside `pipe()`:

```ts
const Schema = v.pipe(v.string(), v.trim(), v.toLowerCase());
v.parse(Schema, '  Hello '); // 'hello'
```

Users keep writing the same `transform()` boilerplate to convert keys and identifiers between
API conventions (`snake_case` from a Python backend, `camelCase` in the frontend, `kebab-case`
for URLs). We want first-class, dependency-free actions for this.

## The ask

Add four new transformation actions, exported from the package root like every other action:

| Action | `type` | `helloWorld` → |
|---|---|---|
| `toCamelCase()` | `'to_camel_case'` | `helloWorld` |
| `toPascalCase()` | `'to_pascal_case'` | `HelloWorld` |
| `toSnakeCase()` | `'to_snake_case'` | `hello_world` |
| `toKebabCase()` | `'to_kebab_case'` | `hello-world` |

They take no arguments, never produce issues, and must look and behave like the existing
transformation actions (same object shape, same file and test conventions, same tree-shaking
annotations). All four must split words **the same way**.

## Word-splitting rules

1. `_`, `-` and ASCII whitespace (space, `\t`, `\n`, `\v`, `\f`, `\r`) separate words. Runs of
   separators collapse; leading and trailing separators disappear. Separator-only input → `''`.
2. A new word starts at an **uppercase letter that follows a lowercase letter or a
   non-letter** (digit or symbol): `helloWorld` → `hello|World`, `123ABC` → `123|ABC`.
3. An **acronym run ends before its last capital** when a lowercase letter follows:
   `parseURLValue` → `parse|URL|Value`, `XMLHttpRequest` → `XML|Http|Request`,
   `aBCd` → `a|B|Cd`. Digits do not end an acronym: `HTTP2` is one word.
4. Digits and other symbols (`.`, `$`, `@`) stay inside the current word: `item2Name` →
   `item2|Name`, `foo.bar` stays `foo.bar`.
5. Every word is lowercased, then camel/pascal capitalize the first letter of the relevant words.
   All-caps input is one word: `HELLO` → `hello`.
6. Non-ASCII letters follow their Unicode case: `ÜBer` → `ü_ber`, `CAFÉ` → `Café` in Pascal.
   Capitalization must work for letters outside the BMP too
   (Deseret `𐐨pple_world` → `𐐀ppleWorld` in Pascal).

More examples: `IOError` → `ioError`, `iPhone` → `iPhone` (camel) / `i_phone` (snake),
`OAuth2Token` → `oAuth2Token` / `o_auth2_token`, `PDFLoader` → `pdf_loader`,
`V2_API_token` → `v2_api_token`.

## Acceptance criteria
- `v.pipe(v.string(), v.toKebabCase())` works with `v.parse`.
- Each conversion is idempotent on its own output.
- Tests for each action, in the repo's existing test style.

## Non-goals
- Custom separators or locale-aware casing (`toLocaleLowerCase`).
- Converting object **keys** (that is a separate feature).
