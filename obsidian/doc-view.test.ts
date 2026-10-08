import { expect, mock, test } from "bun:test";

mock.module("obsidian", () => ({ FileView: class {}, Plugin: class {} }));
const { withDocumentPolicy } = require("./local-plugins/doc-view/main.js");

test("wraps converted HTML with a restrictive policy and readable styles", () => {
  const html = withDocumentPolicy(
    '<html><head><style>body { color: #000; }</style></head><body>本文</body></html>',
  );
  const head = html.indexOf("<head>");
  const csp = html.indexOf('http-equiv="Content-Security-Policy"');
  const textutilStyle = html.indexOf("<style>body { color: #000; }</style>");
  const frameStyle = html.indexOf("<style>", textutilStyle + 1);
  expect(csp).toBeGreaterThan(head);
  expect(csp).toBeLessThan(textutilStyle);
  expect(frameStyle).toBeGreaterThan(textutilStyle);
  expect(html).toContain("default-src 'none'; style-src 'unsafe-inline'; img-src data:");
  expect(html).toContain("html { background: #fff; }");
  expect(html).toContain("color: #000; background: #fff;");
  expect(html).not.toContain("prefers-color-scheme");
  expect(html).not.toContain("color-scheme");
  expect(html).toContain("<body>本文</body>");
});

test("wraps fragments as a complete document", () => {
  const html = withDocumentPolicy("日本語");
  expect(html).toStartWith("<!doctype html><html><head>");
  expect(html).toContain("<body>日本語</body></html>");
});
