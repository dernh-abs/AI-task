import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const distRoot = new URL("dist/", new URL("../", import.meta.url));
const distHtml = await readFile(new URL("index.html", distRoot), "utf8");

const scriptMatch = distHtml.match(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/);
const styleMatch = distHtml.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/);

if (!scriptMatch || !styleMatch) {
  throw new Error("Unable to locate the built JavaScript or CSS assets.");
}

const configuredBase = (process.env.VITE_BASE_PATH || "/").replace(/^\/+|\/+$/g, "");
const resolveAsset = (assetPath) => {
  let relativePath = assetPath.replace(/^\.?\/+/, "");
  if (configuredBase && relativePath.startsWith(`${configuredBase}/`)) {
    relativePath = relativePath.slice(configuredBase.length + 1);
  }
  return new URL(relativePath, distRoot);
};
const [javascript, stylesheet] = await Promise.all([
  readFile(resolveAsset(scriptMatch[1]), "utf8"),
  readFile(resolveAsset(styleMatch[1]), "utf8"),
]);

const standaloneHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>全意 AI 工作中枢 · 最新设计预览</title>
    <style>${stylesheet}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module">${javascript.replace(/<\/script/gi, "<\\/script")}</script>
  </body>
</html>
`;

await writeFile(new URL("design-preview.html", new URL("../", import.meta.url)), standaloneHtml, "utf8");
console.log(`Generated standalone preview: ${projectRoot}design-preview.html`);
