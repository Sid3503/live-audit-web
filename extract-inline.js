import fs from 'fs';
import path from 'path';

function processHtmlFile(filePath) {
  let html = fs.readFileSync(filePath, 'utf-8');
  let inlineScripts = [];

  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  
  html = html.replace(scriptRegex, (match, content) => {
    // If it has a src attribute, keep it as is
    if (match.includes('src=')) {
      return match;
    }
    // If it has content, it's an inline script
    if (content.trim()) {
      inlineScripts.push(content);
      return ''; // Remove the inline script from HTML
    }
    return match;
  });

  if (inlineScripts.length > 0) {
    const combinedScript = inlineScripts.join('\n;\n');
    const scriptFileName = 'inline-scripts.js';
    const dir = path.dirname(filePath);
    
    fs.writeFileSync(path.join(dir, scriptFileName), combinedScript);
    
    // Inject the new external script at the end of body or just before ending HTML
    if (html.includes('</body>')) {
      html = html.replace('</body>', `<script src="${scriptFileName}"></script></body>`);
    } else {
      html += `<script src="${scriptFileName}"></script>`;
    }
    
    fs.writeFileSync(filePath, html);
    console.log(`✅ Extracted inline scripts from ${filePath} to ${scriptFileName}`);
  }
}

const targetPath = 'ui/out/popup/index.html';
if (fs.existsSync(targetPath)) {
  processHtmlFile(targetPath);
} else {
  console.log(`⚠️ Could not find ${targetPath} to extract inline scripts.`);
}
