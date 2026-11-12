// Склеивает сборку Vite в один самодостаточный HTML-файл (dist/kryazh.html).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
let html = readFileSync(join(dist, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/, (_, f) => `<style>${readFileSync(join(dist, f), 'utf8')}</style>`);
html = html.replace(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/, '');
const js = readFileSync(join(dist, html.match(/assets\/[^"']+\.js/)?.[0] ?? findJs()), 'utf8');
function findJs() {
  const m = readFileSync(join(dist, 'index.html'), 'utf8').match(/src="\.\/(assets\/[^"]+\.js)"/);
  return m[1];
}
html = html.replace('</body>', () => `<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>\n</body>`);
writeFileSync(join(dist, 'kryazh.html'), html);
console.log('dist/kryazh.html', (html.length / 1024).toFixed(0) + ' КБ');
