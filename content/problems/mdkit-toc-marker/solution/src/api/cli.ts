// The `mdkit` command. I/O is injected so the CLI can run in tests, in the
// browser playground and in the real Node bin (bin/mdkit.js, not in this repo).
//
//   mdkit render <file> [--format html|text] [--xhtml] [--unsafe-html] [--no-anchors] [--breaks] [--toc-depth N]
//   mdkit toc <file> [--min-depth N] [--max-depth N] [--format html|md|json]
//   mdkit fm <file>
//
// Exit codes: 0 ok, 1 runtime error (missing file, bad front matter), 2 usage error.

import { MdkitError, UsageError } from "../core/errors";
import { renderTocMarkdown, tocToJson } from "../render/toc";
import { type FlagSpec, parseArgs } from "./args";
import { createProcessor, isValidTocDepth } from "./processor";

export interface CliIO {
  readFile(path: string): string | undefined;
  stdout(s: string): void;
  stderr(s: string): void;
}

const USAGE = `usage: mdkit <command> <file> [options]

commands:
  render <file>   render Markdown (--format html|text, --xhtml, --unsafe-html, --no-anchors, --breaks,
                  --toc-depth N)
  toc <file>      print the table of contents (--min-depth N, --max-depth N, --format html|md|json)
  fm <file>       print front matter as JSON
`;

const SPECS: Record<string, FlagSpec> = {
  render: {
    format: "string",
    xhtml: "boolean",
    "unsafe-html": "boolean",
    anchors: "boolean",
    breaks: "boolean",
    "toc-depth": "number",
  },
  toc: { format: "string", "min-depth": "number", "max-depth": "number" },
  fm: {},
};

function readInput(io: CliIO, positionals: string[]): string {
  const file = positionals[0];
  if (!file) throw new UsageError("missing <file>");
  if (positionals.length > 1) throw new UsageError(`unexpected argument "${positionals[1]}"`);
  const src = io.readFile(file);
  if (src === undefined) throw new MdkitError("E_NOENT", `cannot read ${file}`);
  return src;
}

function cmdRender(argv: string[], io: CliIO): void {
  const { positionals, flags } = parseArgs(argv, SPECS.render);
  const format = (flags.format as string | undefined) ?? "html";
  if (format !== "html" && format !== "text") throw new UsageError(`unknown format "${format}"`);
  const tocDepth = flags["toc-depth"] as number | undefined;
  if (tocDepth !== undefined && !isValidTocDepth(tocDepth)) {
    throw new UsageError("--toc-depth must be an integer from 1 to 6");
  }
  const src = readInput(io, positionals);
  const processor = createProcessor({
    xhtml: flags.xhtml === true,
    html: flags["unsafe-html"] === true,
    anchors: flags.anchors !== false,
    breaks: flags.breaks === true,
  });
  const res = processor.process(src, { tocDepth });
  io.stdout(format === "html" ? res.html : res.text);
}

function cmdToc(argv: string[], io: CliIO): void {
  const { positionals, flags } = parseArgs(argv, SPECS.toc);
  const format = (flags.format as string | undefined) ?? "md";
  const src = readInput(io, positionals);
  const processor = createProcessor({
    toc: { minDepth: flags["min-depth"] as number | undefined, maxDepth: flags["max-depth"] as number | undefined },
  });
  const res = processor.process(src);
  switch (format) {
    case "md":
      io.stdout(renderTocMarkdown(res.toc));
      break;
    case "html":
      io.stdout(res.tocHtml);
      break;
    case "json":
      io.stdout(JSON.stringify(tocToJson(res.toc), null, 2) + "\n");
      break;
    default:
      throw new UsageError(`unknown format "${format}"`);
  }
}

function cmdFm(argv: string[], io: CliIO): void {
  const { positionals } = parseArgs(argv, SPECS.fm);
  const src = readInput(io, positionals);
  io.stdout(JSON.stringify(createProcessor().process(src).frontMatter, null, 2) + "\n");
}

export function runCli(argv: string[], io: CliIO): number {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case "render":
        cmdRender(rest, io);
        return 0;
      case "toc":
        cmdToc(rest, io);
        return 0;
      case "fm":
        cmdFm(rest, io);
        return 0;
      case undefined:
      case "help":
      case "--help":
        io.stdout(USAGE);
        return command === undefined ? 2 : 0;
      default:
        throw new UsageError(`unknown command "${command}"`);
    }
  } catch (e) {
    if (e instanceof UsageError) {
      io.stderr(`mdkit: ${e.message}\n\n${USAGE}`);
      return 2;
    }
    if (e instanceof MdkitError) {
      io.stderr(`mdkit: ${e.message}\n`);
      return 1;
    }
    throw e;
  }
}
