/**
 * Genera screenshots @ 1280x720 para subir al Mavis Hub Greenlight form.
 *
 * Páginas públicas (sin login) que sirven:
 * 1. /my-axies (Run demo → cards con frame dorado animado) ⭐ MUST
 * 2. /rules (Web 2.5 design + economy 90/5/5)
 * 3. / (homepage)
 * 4. /cards (catálogo de cartas, si es público)
 * 5. /login (muestra los providers OAuth + disclaimers)
 *
 * Output: pitch/assets/screenshots/*.png @ 1280x720
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'pitch', 'assets', 'screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = 'https://axie-duel.vercel.app';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('Launching Chrome at 1280x720...');
const browser = await puppeteer.launch({
  headless: 'new',
  defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

async function shoot(path, file, customAction = null) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const url = `${BASE}${path}`;
  console.log(`→ ${url}`);
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await wait(1200); // paint settle

  if (customAction) {
    await customAction(page);
  }

  const out = resolve(OUT, file);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`  ✓ ${out}`);
  await page.close();
}

// 1. /my-axies con Run demo clickeado (KILLER demo — gold frame visible)
await shoot('/my-axies', '1-my-axies-demo.png', async (page) => {
  try {
    const demoBtn = await page.waitForSelector('.my-axies-mode-demo', {
      visible: true,
      timeout: 5000,
    });
    await demoBtn.click();
    await page.waitForSelector('.my-axies-card', { timeout: 5000 });
    await wait(2000); // let gold frame animation start + cards settle
  } catch (e) {
    console.log('  (Run demo no se pudo clickear, screenshoteo estado inicial)');
  }
});

// 2. /rules — Web 2.5 design + economy
await shoot('/rules', '2-rules-web25.png');

// 3. / homepage
await shoot('/', '3-homepage.png');

// 4. /cards — catálogo
await shoot('/cards', '4-cards-catalog.png');

// 5. /login — providers visibles + disclaimer
await shoot('/login', '5-login-onboarding.png');

await browser.close();
console.log('\n✓ Done — screenshots in', OUT);
