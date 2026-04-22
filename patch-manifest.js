import fs from 'fs';
import path from 'path';

const distDir = 'dist';
const manifestPath = path.join(distDir, 'manifest.json');
const legacyNextDir = path.join(distDir, '_next');
const safeNextDir = path.join(distDir, 'next-assets');
const NEXT_PATH_RE = /\/_next\//g;
const TEXT_EXTENSIONS = new Set(['.html', '.txt', '.js', '.css', '.json', '.map']);
const INLINE_SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath);
      continue;
    }

    const ext = path.extname(entry.name);
    if (!TEXT_EXTENSIONS.has(ext)) {
      continue;
    }

    const contents = fs.readFileSync(fullPath, 'utf-8');
    const patched = contents.replace(NEXT_PATH_RE, '/next-assets/');
    if (patched !== contents) {
      fs.writeFileSync(fullPath, patched);
    }
  }
}

function externalizeInlineScripts(htmlPath) {
  const dir = path.dirname(htmlPath);
  const scriptFilePath = path.join(dir, 'inline-scripts.js');
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const inlineScripts = [];

  const updatedHtml = html.replace(INLINE_SCRIPT_RE, (match, attrs, content) => {
    if (/\bsrc\s*=/.test(attrs)) {
      return match;
    }

    const trimmed = content.trim();
    if (!trimmed) {
      return '';
    }

    inlineScripts.push(trimmed);
    return '';
  });

  if (inlineScripts.length === 0) {
    if (fs.existsSync(scriptFilePath)) {
      fs.rmSync(scriptFilePath, { force: true });
    }
    return;
  }

  const bundledScript = `${inlineScripts.join('\n;\n')}\n`;
  fs.writeFileSync(scriptFilePath, bundledScript);

  const scriptTag = '<script src="inline-scripts.js"></script>';
  const finalHtml = updatedHtml.includes(scriptTag)
    ? updatedHtml
    : updatedHtml.replace('</body>', `${scriptTag}</body>`);

  fs.writeFileSync(htmlPath, finalHtml);
}

function walkHtmlFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtmlFiles(fullPath);
      continue;
    }

    if (path.extname(entry.name) === '.html') {
      externalizeInlineScripts(fullPath);
    }
  }
}

if (fs.existsSync(safeNextDir)) {
  fs.rmSync(safeNextDir, { recursive: true, force: true });
}

if (fs.existsSync(legacyNextDir)) {
  fs.renameSync(legacyNextDir, safeNextDir);
}

walkFiles(distDir);
walkHtmlFiles(distDir);

const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

m.action = m.action || {};
m.action.default_popup = 'popup/index.html';

fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2));
console.log('✅ Patched dist/ artifact for Chrome-safe Next.js popup assets');
