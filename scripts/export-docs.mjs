/**
 * Batch convert all project Markdown to PDF + DOCX.
 *
 * - PDF via md-to-pdf (Puppeteer) — high-fidelity HTML rendering, no LaTeX needed
 * - DOCX via Pandoc native — preserves headings, tables, code blocks
 *
 * Output: ../pitch/exports/<basename>.pdf + <basename>.docx
 */
import { mdToPdf } from 'md-to-pdf';
import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, basename } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const OUT = resolve(REPO, 'pitch', 'exports');
mkdirSync(OUT, { recursive: true });

function resolvePandoc() {
  try {
    execSync('pandoc --version', { stdio: 'ignore' });
    return 'pandoc';
  } catch {
    const candidate = 'C:/Users/Anuar/AppData/Local/Microsoft/WinGet/Packages/JohnMacFarlane.Pandoc_Microsoft.Winget.Source_8wekyb3d8bbwe/pandoc-3.9.0.2/pandoc.exe';
    if (existsSync(candidate)) return `"${candidate}"`;
    throw new Error('pandoc not found on PATH or known WinGet location');
  }
}
const PANDOC = resolvePandoc();

const INPUTS = [
  'README.md',
  'docs/PARTS_ALGORITHM.md',
  'docs/ECONOMY.md',
  'docs/F2P_BALANCE_MANIFESTO.md',
  'docs/WEB_25_MANIFESTO.md',
  'docs/PROGRESSION.md',
  'pitch/PITCH_DECK.md',
  'pitch/EMAIL_TEMPLATE.md',
  'pitch/DISCORD_INTRO.md',
  'pitch/TWITTER_THREAD.md',
  'pitch/VIDEO_SCRIPT.md',
  'pitch/README.md',
  'pitch/HOWTO_RECORD_VIDEO.md',
  'pitch/HOWTO_SEND_TO_SKY_MAVIS.md',
];

// Inline CSS — clean print-friendly look. Sky Mavis evaluator should feel pro.
const css = `
  @page { size: A4; margin: 1in; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 11pt; line-height: 1.55; color: #0f172a;
  }
  h1 {
    font-size: 22pt; margin: 0 0 0.4em;
    border-bottom: 3px solid #c084fc; padding-bottom: 0.3em;
    letter-spacing: -0.02em;
  }
  h2 {
    font-size: 15pt; margin: 1.4em 0 0.4em;
    color: #1e293b; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.2em;
  }
  h3 { font-size: 12.5pt; margin: 1em 0 0.3em; color: #334155; }
  h4 { font-size: 11pt; margin: 0.8em 0 0.25em; color: #475569; }
  p { margin: 0.4em 0 0.7em; }
  blockquote {
    margin: 0.8em 0; padding: 0.4em 1em;
    border-left: 4px solid #60a5fa; background: #f1f5f9; color: #1e293b;
  }
  code {
    font-family: 'Cascadia Code', 'Fira Code', Consolas, monospace;
    font-size: 9.5pt; background: #f1f5f9; padding: 1px 5px; border-radius: 3px;
    color: #be185d;
  }
  pre {
    background: #0f172a; color: #e2e8f0; padding: 12px 16px; border-radius: 6px;
    font-size: 9pt; line-height: 1.5; overflow-x: auto;
    page-break-inside: avoid;
  }
  pre code { background: transparent; color: inherit; padding: 0; }
  table {
    border-collapse: collapse; margin: 0.8em 0; width: 100%; font-size: 10pt;
  }
  th, td {
    border: 1px solid #cbd5e1; padding: 6px 10px; text-align: left;
    vertical-align: top;
  }
  th { background: #e0e7ff; color: #3730a3; font-weight: 700; }
  tr:nth-child(even) td { background: #f8fafc; }
  ul, ol { margin: 0.4em 0 0.7em; padding-left: 1.6em; }
  li { margin: 0.15em 0; }
  a { color: #2563eb; text-decoration: none; }
  hr { border: none; border-top: 1px solid #cbd5e1; margin: 1.2em 0; }
  strong { color: #0f172a; font-weight: 700; }
  em { color: #475569; }
  img { max-width: 100%; }
`;

console.log(`Exporting ${INPUTS.length} markdown files → PDF + DOCX in ${OUT}`);
console.log('');

let pdfOk = 0, pdfFail = 0, docxOk = 0, docxFail = 0;

for (const md of INPUTS) {
  const inPath = resolve(REPO, md);
  if (!existsSync(inPath)) {
    console.log(`✗ SKIP (not found): ${md}`);
    continue;
  }
  const stem = basename(md, '.md');
  const prefix = md.split('/')[0] === md ? '' : `${md.split('/')[0]}-`;
  const baseName = `${prefix}${stem}`; // keep dir prefix to avoid READMEs colliding
  const pdfOut = resolve(OUT, `${baseName}.pdf`);
  const docxOut = resolve(OUT, `${baseName}.docx`);

  // PDF via md-to-pdf
  try {
    await mdToPdf(
      { path: inPath },
      {
        dest: pdfOut,
        css,
        pdf_options: {
          format: 'A4',
          margin: { top: '20mm', right: '18mm', bottom: '20mm', left: '18mm' },
          printBackground: true,
        },
        launch_options: { args: ['--no-sandbox'] },
      },
    );
    const sz = (statSync(pdfOut).size / 1024).toFixed(1);
    console.log(`✓ PDF  ${baseName}.pdf (${sz} KB)`);
    pdfOk++;
  } catch (err) {
    console.log(`✗ PDF  ${baseName}.pdf — ${err.message}`);
    pdfFail++;
  }

  // DOCX via Pandoc — workdir = REPO so relative image refs resolve
  try {
    execSync(
      `${PANDOC} --from=gfm "${inPath}" -o "${docxOut}"`,
      { stdio: 'pipe', cwd: REPO },
    );
    const sz = (statSync(docxOut).size / 1024).toFixed(1);
    console.log(`✓ DOCX ${baseName}.docx (${sz} KB)`);
    docxOk++;
  } catch (err) {
    console.log(`✗ DOCX ${baseName}.docx — ${err.message.slice(0, 80)}`);
    docxFail++;
  }
}

console.log('');
console.log(`Summary: PDF ${pdfOk}/${pdfOk + pdfFail} · DOCX ${docxOk}/${docxOk + docxFail}`);
