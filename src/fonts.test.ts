import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Every character the app can put on screen has to exist in the SDF atlases.
 *
 * The renderer draws a glyph the atlas lacks as "?", silently. It happened in
 * several places at once: "◀ ▶" in the player hint, "—" in the login hint, "✓"
 * on the favourite button, "…" on every loading line, "•" in card captions and
 * a 48px "★" on the empty favourites screen. None of it shows in a test, a type
 * check or the browser's DOM; only on the canvas.
 *
 * So this scans what can reach a <Text>: string and template literals and JSX
 * text, across src. Error and log messages are skipped, since they go to the
 * console, and regex literals are a different node, so character classes in
 * them are not text. When a string fails here, use a character the atlas has
 * ("·" for a separator, "..." for an ellipsis) or rebuild the atlas with it.
 */

const ROOT = join(__dirname, "..");
const ATLASES = ["public/fonts/NotoSans-Regular.msdf.json", "public/fonts/NotoSans-Bold.msdf.json"];

function atlasGlyphs(path: string): Set<string> {
  const atlas = JSON.parse(readFileSync(join(ROOT, path), "utf8")) as { chars: { id: number }[] };
  return new Set(atlas.chars.map(glyph => String.fromCodePoint(glyph.id)));
}

// Regular and bold are drawn from different atlases, so a character must be in both.
const [regular, ...others] = ATLASES.map(atlasGlyphs);
const GLYPHS = new Set([...regular].filter(char => others.every(atlas => atlas.has(char))));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "test" ? [] : sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name) || /\.(test|e2e|stories)\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

/** Text that goes to the console or into an exception, never to the canvas. */
function isDiagnostic(node: ts.Node): boolean {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isNewExpression(current) && /Error$/.test(current.expression.getText())) return true;
    if (ts.isCallExpression(current)) {
      const callee = current.expression.getText();
      if (/^(console|logger)\.\w+$/.test(callee)) return true;
    }
  }
  return false;
}

function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) return node.text;
  if (ts.isJsxText(node)) return node.text;
  return null;
}

function missingGlyphs(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const found: string[] = [];

  const visit = (node: ts.Node) => {
    // Module specifiers are paths, not text.
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    const text = literalText(node);
    if (text !== null && !isDiagnostic(node)) {
      for (const char of new Set(text)) {
        if (/\s/.test(char) || GLYPHS.has(char)) continue;
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        const code = char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0");
        found.push(`${relative(ROOT, file)}:${line + 1} "${char}" (U+${code})`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("font coverage", () => {
  it("reads both atlases", () => {
    // A wrong path or format would make every check below pass vacuously.
    expect(GLYPHS.size).toBeGreaterThan(150);
    expect(GLYPHS.has("ç")).toBe(true);
    expect(GLYPHS.has("·")).toBe(true);
  });

  it("only uses characters the atlases can draw", () => {
    const missing = sourceFiles(join(ROOT, "src")).flatMap(missingGlyphs);
    expect(missing).toEqual([]);
  });
});
