const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function convertPage(inputFile, routeName) {
    const htmlStr = fs.readFileSync(inputFile, 'utf-8');
    const dom = new JSDOM(htmlStr);
    const document = dom.window.document;

    // 1. Extract CSS
    const styleTags = document.querySelectorAll('style');
    let cssContent = '';
    styleTags.forEach(tag => {
        cssContent += tag.textContent + '\n';
    });

    // 2. Extract JS
    const scriptTags = document.querySelectorAll('script:not([src])');
    let jsContent = '';
    scriptTags.forEach(tag => {
        jsContent += tag.textContent + '\n';
    });

    // 3. Extract body HTML minus the header (.app-topnav) and external scripts
    const header = document.querySelector('.app-topnav');
    if (header) {
        header.remove();
    }

    // remove script tags from body
    document.querySelectorAll('script').forEach(s => s.remove());

    const bodyHtml = document.body.innerHTML;

    // 4. Create Next.js files
    const outDir = path.join(__dirname, '..', 'src', 'app', routeName);
    fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(path.join(outDir, `${routeName}.css`), cssContent.trim());

    // Make the JS safe for Next.js (wrap in useEffect, avoid multiple bindings if HMR)
    const pageTsx = `
'use client';

import { useEffect, useRef } from 'react';
import './${routeName}.css';

export default function ${routeName.charAt(0).toUpperCase() + routeName.slice(1)}Page() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // We delay slightly to ensure DOM is fully painted by React
    const t = setTimeout(() => {
      try {
        ${jsContent}
      } catch (err) {
        console.error(err);
      }
    }, 100);

    return () => clearTimeout(t);
  }, []);

  return (
    <div dangerouslySetInnerHTML={{ __html: \`${bodyHtml.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\` }} />
  );
}
  `.trim();

    fs.writeFileSync(path.join(outDir, 'page.tsx'), pageTsx);
    console.log(`Converted ${inputFile} to /${routeName}`);
}

['index', 'why', 'journey'].forEach(name => {
    const file = path.join(__dirname, '..', `tmp_${name}.html`);
    const route = name === 'index' ? 'system' : name; // tmp_index.html goes to /system
    convertPage(file, route);
});

