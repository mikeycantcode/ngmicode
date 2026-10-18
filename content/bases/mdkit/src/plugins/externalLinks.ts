// Marks links to other hosts with rel="noopener noreferrer" (and optionally
// target="_blank").

import { findAll } from "../core/ast";
import { hostOf, isAbsoluteHttp } from "../util/url";
import type { Plugin } from "./pluginHost";

export interface ExternalLinkOptions {
  /** Our own host; links to it are left alone. */
  siteHost?: string;
  /** Add target="_blank". Default true. */
  newTab?: boolean;
}

export function externalLinks(opts: ExternalLinkOptions = {}): Plugin {
  const site = opts.siteHost?.toLowerCase() ?? null;
  const newTab = opts.newTab ?? true;
  return {
    name: "externalLinks",
    hooks: {
      afterInlines(root) {
        for (const link of findAll(root, "link")) {
          if (!isAbsoluteHttp(link.href)) continue;
          if (site && hostOf(link.href) === site) continue;
          link.attrs = { ...link.attrs, rel: "noopener noreferrer" };
          if (newTab) link.attrs.target = "_blank";
        }
      },
    },
  };
}
