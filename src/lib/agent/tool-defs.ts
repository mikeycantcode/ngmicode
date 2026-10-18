// OpenAI-style tool schemas sent to the model. Tools execute in the browser.
export const TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List file paths in the repository, optionally under a directory prefix.",
      parameters: {
        type: "object",
        properties: { dir: { type: "string", description: "Directory prefix, e.g. 'src/payments'. Omit for the whole repo." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file with line numbers. Use start_line/end_line for large files.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          start_line: { type: "integer", description: "1-based, inclusive" },
          end_line: { type: "integer", description: "1-based, inclusive" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search",
      description: "Search file contents. Returns matching lines as path:line: text. Case-insensitive substring unless regex=true.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          regex: { type: "boolean" },
          dir: { type: "string", description: "Optional directory prefix to limit the search" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description:
        "Replace an exact, unique snippet in a file. old_string must match exactly once (include surrounding lines for uniqueness). Prefer this over write_file for existing files.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" } },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create a new file or fully overwrite an existing one.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_tests",
      description: "Run the repository's visible test suite (or one test file) and return pass/fail details.",
      parameters: {
        type: "object",
        properties: { path: { type: "string", description: "Optional single test file path" } },
      },
    },
  },
] as const;
