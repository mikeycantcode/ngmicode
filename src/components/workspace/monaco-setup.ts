"use client";

import type * as Monaco from "monaco-editor";

const TESTKIT_DTS = `declare module "testkit" {
  type Fn = () => unknown | Promise<unknown>;
  interface Matchers {
    toBe(v: unknown): void; toEqual(v: unknown): void; toStrictEqual(v: unknown): void; toMatchObject(v: unknown): void;
    toBeTruthy(): void; toBeFalsy(): void; toBeNull(): void; toBeUndefined(): void; toBeDefined(): void; toBeNaN(): void;
    toBeInstanceOf(c: unknown): void; toBeGreaterThan(n: number | bigint): void; toBeGreaterThanOrEqual(n: number | bigint): void;
    toBeLessThan(n: number | bigint): void; toBeLessThanOrEqual(n: number | bigint): void; toBeCloseTo(n: number, digits?: number): void;
    toContain(v: unknown): void; toContainEqual(v: unknown): void; toHaveLength(n: number): void; toHaveProperty(k: string, v?: unknown): void;
    toMatch(r: RegExp | string): void; toThrow(e?: string | RegExp | (new (...a: any[]) => unknown)): void;
  }
  type AsyncMatchers = { [K in keyof Matchers]: (...a: Parameters<Matchers[K]>) => Promise<void> };
  interface Expect extends Matchers { not: Matchers; resolves: AsyncMatchers & { not: AsyncMatchers }; rejects: AsyncMatchers & { not: AsyncMatchers } }
  export function expect(actual: unknown): Expect;
  export const describe: ((name: string, fn: () => void) => void) & { skip(name: string, fn?: () => void): void };
  export const it: ((name: string, fn: Fn) => void) & { skip(name: string, fn: Fn): void; only(name: string, fn: Fn): void };
  export const test: typeof it;
  export function beforeEach(fn: Fn): void;
  export function afterEach(fn: Fn): void;
}`;

let configured = false;

export function uriFor(monaco: typeof Monaco, path: string) {
  return monaco.Uri.parse(`file:///${path}`);
}

export function languageFor(path: string) {
  if (/\.tsx?$/.test(path)) return "typescript";
  if (/\.(m?js)$/.test(path)) return "javascript";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  return "plaintext";
}

export function configureMonaco(monaco: typeof Monaco) {
  if (configured) return;
  configured = true;
  // monaco-editor >=0.55 exposes TS settings at monaco.typescript; older at monaco.languages.typescript.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ts: any = (monaco as any).typescript ?? (monaco.languages as any).typescript;
  if (ts) {
  ts.typescriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    lib: ["es2022"],
  });
  ts.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false, diagnosticCodesToIgnore: [2307, 2792] });
  ts.typescriptDefaults.setEagerModelSync(true);
  ts.typescriptDefaults.addExtraLib(TESTKIT_DTS, "file:///node_modules/@types/testkit/index.d.ts");
  }

  const theme = (base: "vs-dark" | "vs", c: Record<string, string>): Monaco.editor.IStandaloneThemeData => ({
    base,
    inherit: true,
    rules: [
      { token: "", foreground: c.text.slice(1) },
      { token: "comment", foreground: c.overlay1.slice(1), fontStyle: "italic" },
      { token: "keyword", foreground: c.mauve.slice(1) },
      { token: "string", foreground: c.green.slice(1) },
      { token: "string.escape", foreground: c.pink.slice(1) },
      { token: "number", foreground: c.peach.slice(1) },
      { token: "regexp", foreground: c.pink.slice(1) },
      { token: "type", foreground: c.yellow.slice(1) },
      { token: "type.identifier", foreground: c.yellow.slice(1) },
      { token: "identifier", foreground: c.text.slice(1) },
      { token: "delimiter", foreground: c.overlay2.slice(1) },
      { token: "operator", foreground: c.sky.slice(1) },
      { token: "tag", foreground: c.blue.slice(1) },
      { token: "attribute.name", foreground: c.yellow.slice(1) },
      { token: "key", foreground: c.blue.slice(1) },
      { token: "string.key.json", foreground: c.blue.slice(1) },
      { token: "string.value.json", foreground: c.green.slice(1) },
    ],
    colors: {
      "editor.background": c.base,
      "editor.foreground": c.text,
      "editorLineNumber.foreground": c.surface2,
      "editorLineNumber.activeForeground": c.lavender,
      "editor.lineHighlightBackground": c.surface0 + "66",
      "editor.selectionBackground": c.overlay2 + "40",
      "editor.inactiveSelectionBackground": c.overlay2 + "26",
      "editorCursor.foreground": c.rosewater,
      "editorIndentGuide.background1": c.surface0,
      "editorIndentGuide.activeBackground1": c.surface2,
      "editorWhitespace.foreground": c.surface1,
      "editorWidget.background": c.mantle,
      "editorWidget.border": c.surface1,
      "editorSuggestWidget.background": c.mantle,
      "editorSuggestWidget.selectedBackground": c.surface0,
      "editorHoverWidget.background": c.mantle,
      "editorBracketMatch.background": c.surface1 + "80",
      "editorBracketMatch.border": c.overlay0,
      "diffEditor.insertedTextBackground": c.green + "26",
      "diffEditor.removedTextBackground": c.red + "26",
      "diffEditor.insertedLineBackground": c.green + "14",
      "diffEditor.removedLineBackground": c.red + "14",
      "scrollbarSlider.background": c.surface1 + "80",
      "scrollbarSlider.hoverBackground": c.surface2 + "80",
      "minimap.background": c.mantle,
      "editorGutter.background": c.base,
      "editorError.foreground": c.red,
      "editorWarning.foreground": c.yellow,
    },
  });
  monaco.editor.defineTheme("ctp-mocha", theme("vs-dark", {
    base: "#1e1e2e", mantle: "#181825", surface0: "#313244", surface1: "#45475a", surface2: "#585b70", overlay0: "#6c7086", overlay1: "#7f849c", overlay2: "#9399b2",
    text: "#cdd6f4", lavender: "#b4befe", mauve: "#cba6f7", green: "#a6e3a1", pink: "#f5c2e7", peach: "#fab387", yellow: "#f9e2af", sky: "#89dceb", blue: "#89b4fa", red: "#f38ba8", rosewater: "#f5e0dc",
  }));
  monaco.editor.defineTheme("ctp-latte", theme("vs", {
    base: "#eff1f5", mantle: "#e6e9ef", surface0: "#ccd0da", surface1: "#bcc0cc", surface2: "#acb0be", overlay0: "#9ca0b0", overlay1: "#8c8fa1", overlay2: "#7c7f93",
    text: "#4c4f69", lavender: "#7287fd", mauve: "#8839ef", green: "#40a02b", pink: "#ea76cb", peach: "#fe640b", yellow: "#df8e1d", sky: "#04a5e5", blue: "#1e66f5", red: "#d20f39", rosewater: "#dc8a78",
  }));
}

/** Creates/updates a Monaco model for every workspace file so cross-file IntelliSense works. */
export function syncModels(monaco: typeof Monaco, files: Record<string, string>) {
  const wanted = new Set(Object.keys(files).map((p) => uriFor(monaco, p).toString()));
  for (const [path, content] of Object.entries(files)) {
    const uri = uriFor(monaco, path);
    const model = monaco.editor.getModel(uri);
    if (!model) monaco.editor.createModel(content, languageFor(path), uri);
    else if (model.getValue() !== content) {
      model.pushEditOperations([], [{ range: model.getFullModelRange(), text: content }], () => null);
    }
  }
  for (const m of monaco.editor.getModels()) {
    const u = m.uri.toString();
    if (u.startsWith("file:///") && !u.startsWith("file:///node_modules") && !wanted.has(u) && !u.includes("__original__")) m.dispose();
  }
}
