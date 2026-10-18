import { it, expect } from "testkit";
import { Mdkit } from "../../src/core/mdkit";

const md = new Mdkit();

it("centers :-: columns", () => {
  expect(md.render("a | b | c\n:-:|:--|--:\n1 | 2 | 3")).toContain(
    '<td style="text-align:center">1</td>\n<td style="text-align:left">2</td>\n<td style="text-align:right">3</td>',
  );
});

it("treats \\| as a literal pipe, also inside code spans", () => {
  expect(md.render("op | meaning\n--|--\n`a \\|\\| b` | x \\| y")).toContain(
    "<tr>\n<td><code>a || b</code></td>\n<td>x | y</td>\n</tr>",
  );
  expect(md.render("a | b\n--|--\nends with pipe \\|")).toContain("<td>ends with pipe |</td>\n<td></td>");
});

it("pads short rows and drops extra cells", () => {
  expect(md.render("a | b | c\n--|--|--\n1\n1 | 2 | 3 | 4")).toContain(
    "<tbody>\n<tr>\n<td>1</td>\n<td></td>\n<td></td>\n</tr>\n<tr>\n<td>1</td>\n<td>2</td>\n<td>3</td>\n</tr>\n</tbody>",
  );
});
