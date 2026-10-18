// Error hierarchy. Everything thrown on purpose by mdkit is an MdkitError so
// callers (the CLI in particular) can tell our errors from genuine crashes.

export class MdkitError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "MdkitError";
    this.code = code;
  }
}

export class FrontMatterError extends MdkitError {
  readonly line: number;
  constructor(message: string, line: number) {
    super("E_FRONT_MATTER", `${message} (front matter line ${line})`);
    this.name = "FrontMatterError";
    this.line = line;
  }
}

export class PluginError extends MdkitError {
  readonly plugin: string;
  constructor(plugin: string, message: string) {
    super("E_PLUGIN", `[${plugin}] ${message}`);
    this.name = "PluginError";
    this.plugin = plugin;
  }
}

export class UsageError extends MdkitError {
  constructor(message: string) {
    super("E_USAGE", message);
    this.name = "UsageError";
  }
}
