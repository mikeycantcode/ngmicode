import { transform } from "sucrase";

export function sucraseTransform(code: string, path: string): string {
  if (path.endsWith(".js") && !/\b(import|export)\b/.test(code)) return code;
  return transform(code, {
    transforms: ["typescript", "imports"],
    filePath: path,
    production: true,
  }).code;
}
