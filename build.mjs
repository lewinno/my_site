import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PAGES_DIR = path.join(ROOT, 'pages');
const ASSETS_DIR = path.join(ROOT, 'assets');
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const DIST_DIR = path.join(ROOT, 'dist');

// Configurable bits
const SITE_TITLE = process.env.SITE_TITLE || 'My Site';
let BASE_PATH = process.env.BASE_PATH || '/'; // e.g. "/" or "/my-repo/"
if (!BASE_PATH.endsWith('/')) BASE_PATH += '/';

async function ensureDir(p) { await fs.mkdir(p, { recursive: true }); }
async function copyDir(src, dest) {
  await ensureDir(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyDir(s, d); else await fs.copyFile(s, d);
  }
}

function extractTitle(md) {
  const m = md.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : 'Untitled';
}

function outPathFor(relDir, file) {
  const base = path.join(DIST_DIR, relDir);
  if (file.toLowerCase() === 'index.md') {
    return path.join(base, 'index.html'); // /index.html or /subdir/index.html
  } else {
    const stem = path.parse(file).name;
    return path.join(base, stem, 'index.html'); // /name/index.html
  }
}

async function build() {
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await ensureDir(DIST_DIR);

  const templateRaw = await fs.readFile(path.join(TEMPLATES_DIR, 'layout.html'), 'utf8');

  // Walk pages recursively
  async function walk(dir, rel = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        await walk(path.join(dir, e.name), path.join(rel, e.name));
      } else if (e.name.endsWith('.md')) {
        const md = await fs.readFile(path.join(dir, e.name), 'utf8');
        const title = extractTitle(md);
        const html = marked.parse(md);
        let page = templateRaw
          .replaceAll('{{title}}', escapeHtml(title))
          .replaceAll('{{site_title}}', escapeHtml(SITE_TITLE))
          .replaceAll('{{base}}', BASE_PATH)
          .replace('{{content}}', html);

        const out = outPathFor(rel, e.name);
        await ensureDir(path.dirname(out));
        await fs.writeFile(out, page, 'utf8');
      }
    }
  }

  await walk(PAGES_DIR);

  // Copy assets
  try {
    await copyDir(ASSETS_DIR, path.join(DIST_DIR, 'assets'));
  } catch { /* optional */ }

  // Minimal 404 page for GitHub Pages
  const notFound = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>404 — ${SITE_TITLE}</title>
  <base href="${BASE_PATH}">
  <link rel="stylesheet" href="assets/styles.css">
  <main class="container"><h1>Page not found</h1><p>Try the <a href="./">home page</a>.</p></main>`;
  await fs.writeFile(path.join(DIST_DIR, '404.html'), notFound, 'utf8');

  console.log('Built → dist/');
}

function escapeHtml(s) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
