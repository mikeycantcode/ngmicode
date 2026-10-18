import { it, expect } from "testkit";
import { createProcessor } from "../../src/api/processor";

it("links a heading containing a link to its real anchor", () => {
  const res = createProcessor().process("# Guide\n\n## Install via [npm](https://npmjs.com)");
  expect(res.html).toContain('<h2 id="install-via-npm">');
  expect(res.toc[0].children[0].id).toBe("install-via-npm");
  expect(res.tocHtml).toContain('<a href="#install-via-npm">');
});

it("every TOC id exists as a heading id", () => {
  const doc = [
    "# Q&amp;A",
    "## Logo ![the logo](/logo.png)",
    "## Run `mdkit` *now*",
    "## Run `mdkit` *now*",
    "## See <https://x.io>",
    "### Fast\\_path",
  ].join("\n\n");
  const res = createProcessor().process(doc);
  const ids: string[] = [];
  const visit = (es: typeof res.toc) => es.forEach((e) => (ids.push(e.id), visit(e.children)));
  visit(res.toc);
  expect(ids).toHaveLength(6);
  for (const id of ids) expect(res.html).toContain(`id="${id}"`);
  expect(ids[0]).toBe("qa");
  expect(ids[3]).toBe("run-mdkit-now-1");
});
