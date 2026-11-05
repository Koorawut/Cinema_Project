/* md2pdf.js — แปลง .md เป็น HTML ด้วย marked แล้วให้ Chrome print เป็น PDF
   ใช้: node md2pdf.js <input.md> <output.pdf> */
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error('ใช้: node md2pdf.js <input.md> <output.pdf>'); process.exit(1); }

const md = fs.readFileSync(input, 'utf8');
const content = marked.parse(md, { gfm: true, breaks: false });

// ใส่ page break ก่อน h2 แต่ละอัน (แยกหมวดเป็นหน้า) — ยกเว้นอันแรก
let first = true;
const withBreaks = content.replace(/<h2>/g, () => {
  if (first) { first = false; return '<h2>'; }
  return '<div class="pagebreak"></div><h2>';
});

const template = fs.readFileSync(path.join(__dirname, 'md2pdf-template.html'), 'utf8');
const html = template.replace('{{{content}}}', withBreaks);

const outHtml = output.replace(/\.pdf$/i, '.html');
fs.writeFileSync(outHtml, html, 'utf8');
console.log('HTML written: ' + outHtml);
console.log('PDF_PATH:' + path.resolve(output));
