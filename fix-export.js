import fs from 'fs';
import path from 'path';

const outDir = 'ui/out';

// 1. Rename _next to next-assets
const oldNextDir = path.join(outDir, '_next');
const newNextDir = path.join(outDir, 'next-assets');
if (fs.existsSync(oldNextDir)) {
  fs.renameSync(oldNextDir, newNextDir);
  console.log('✅ Renamed _next directory to next-assets');
}

// 2. Replace absolute references to /_next/ to /next-assets/ in all static files
function replaceInDir(dir, searchRegex, replaceStr) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      replaceInDir(fullPath, searchRegex, replaceStr);
    } else {
      const ext = path.extname(fullPath);
      if (['.html', '.js', '.css', '.json'].includes(ext)) {
        let content = fs.readFileSync(fullPath, 'utf8');
        // also replace /_next/ 
        let updated = content.replace(/\/_next\//g, '/next-assets/');
        // also replace escaped \/_next\/
        updated = updated.replace(/\\\/_next\\\//g, '\\/next-assets\\/');
        if (updated !== content) {
          fs.writeFileSync(fullPath, updated);
        }
      }
    }
  }
}
replaceInDir(outDir, /\/_next\//g, '/next-assets/');
console.log('✅ Replaced all references to _next with next-assets');

// 3. Extract inline scripts from HTML
function extractInlineScripts(filePath) {
  let html = fs.readFileSync(filePath, 'utf-8');
  let inlineScripts = [];
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  
  html = html.replace(scriptRegex, (match, content) => {
    // If it has a src attribute, keep it
    if (match.includes('src=')) return match;
    // If it has content, it's an inline script
    if (content.trim()) {
      inlineScripts.push(content);
      return ''; // remove inline script
    }
    return match;
  });

  if (inlineScripts.length > 0) {
    const combinedScript = inlineScripts.join('\n;\n');
    const scriptFileName = 'inline-scripts.js';
    const dir = path.dirname(filePath);
    
    fs.writeFileSync(path.join(dir, scriptFileName), combinedScript);
    
    // Inject the new external script at the end of body
    if (html.includes('</body>')) {
      html = html.replace('</body>', `<script src="${scriptFileName}"></script></body>`);
    } else {
      html += `<script src="${scriptFileName}"></script>`;
    }
    fs.writeFileSync(filePath, html);
    console.log(`✅ Extracted inline scripts from ${filePath} to ${scriptFileName}`);
  }
}

function processAllHtmlFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      processAllHtmlFiles(fullPath);
    } else if (path.extname(fullPath) === '.html') {
      extractInlineScripts(fullPath);
    }
  }
}

processAllHtmlFiles(outDir);
