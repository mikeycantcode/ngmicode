import { transform } from "sucrase";

export function sucraseTransform(code: string, path: string): string {
  if (/\.(c?js)$/.test(path) && !/\b(import|export)\b/.test(code)) return code;
  const jsx = /\.(tsx|jsx)$/.test(path);
  return transform(code, {
    transforms: jsx ? ["typescript", "jsx", "imports"] : ["typescript", "imports"],
    filePath: path,
    production: true,
  }).code;
}
