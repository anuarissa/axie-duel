/**
 * Teaser GIF recorder for /my-axies → 30s loop for Twitter/Discord.
 *
 * Strategy: Puppeteer drives Chrome, puppeteer-screen-recorder captures via CDP
 * screencast at 30 fps → mp4. Then FFmpeg two-pass palette optimizes → gif.
 *
 * Output: ../pitch/assets/my-axies-teaser.gif (target < 5 MB, 900px wide).
 */
import puppeteer from 'puppeteer';
import { PuppeteerScreenRecorder } from 'puppeteer-screen-recorder';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync, existsSync } from 'node:fs';

// Refresh PATH from registry — winget installs go to User PATH which Bash subshells
// don't always inherit. We resolve ffmpeg from the WinGet packages dir if it's not
// already on PATH.
function resolveFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return 'ffmpeg';
  } catch {
    const candidates = [
      'C:/Users/Anuar/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe',
    ];
    for (const c of candidates) if (existsSync(c)) return `"${c}"`;
    throw new Error('ffmpeg not found on PATH or known WinGet locations');
  }
}
const FFMPEG = resolveFfmpeg();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(__dirname, '..', 'pitch', 'assets');
const MP4 = resolve(ASSETS, 'recording.mp4');
const PALETTE = resolve(ASSETS, 'palette.png');
const GIF = resolve(ASSETS, 'my-axies-teaser.gif');
const URL = process.env.TEASER_URL ?? 'https://axie-duel.vercel.app/my-axies';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`[1/3] Launching headless Chrome → ${URL}`);
const browser = await puppeteer.launch({
  headless: 'new',
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
});
const page = await browser.newPage();

const recorder = new PuppeteerScreenRecorder(page, {
  followNewTab: false,
  fps: 30,
  videoFrame: { width: 1280, height: 800 },
  videoCrf: 18,
  videoCodec: 'libx264',
  videoPreset: 'ultrafast',
  videoBitrate: 4000,
  autopad: { color: 'black' },
  aspectRatio: '16:9',
});

await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
await wait(800); // page paint settle

// Storyboard: 0–28 s capture (last 2 s padded by ffmpeg trim).
console.log('[2/3] Recording...');
await recorder.start(MP4);

// 0–3s: header on screen
await wait(3000);

// 3–5s: animate cursor toward Demo button (smooth tween)
const demoBtn = await page.waitForSelector('.my-axies-mode-demo', { visible: true });
const box = await demoBtn.boundingBox();
const targetX = box.x + box.width / 2;
const targetY = box.y + box.height / 2;
const steps = 20;
const startX = 200, startY = 200;
for (let i = 1; i <= steps; i++) {
  const t = i / steps;
  // Ease-out cubic
  const e = 1 - Math.pow(1 - t, 3);
  await page.mouse.move(startX + (targetX - startX) * e, startY + (targetY - startY) * e);
  await wait(80);
}

// 5–7s: hover before click for visual punch
await wait(800);
await demoBtn.click();

// 7–14s: cards render — let viewer absorb
await page.waitForSelector('.my-axies-card', { visible: true, timeout: 5000 });
await wait(7000);

// 14–22s: scroll slowly to reveal more cards / details
await page.evaluate(() => {
  return new Promise((res) => {
    let y = 0;
    const target = 600;
    const id = setInterval(() => {
      y += 12;
      window.scrollTo(0, y);
      if (y >= target) { clearInterval(id); res(); }
    }, 120);
  });
});
await wait(2500);

// 22–28s: hold at scrolled view
await wait(6000);

await recorder.stop();
console.log('[3/3] Encoding GIF (two-pass palette)...');
await browser.close();

// FFmpeg pass 1 — palette generation
execSync(
  `${FFMPEG} -y -i "${MP4}" -vf "fps=15,scale=900:-1:flags=lanczos,palettegen=stats_mode=full" "${PALETTE}"`,
  { stdio: 'inherit' },
);
// FFmpeg pass 2 — gif encode using palette
execSync(
  `${FFMPEG} -y -i "${MP4}" -i "${PALETTE}" -filter_complex "fps=15,scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5" "${GIF}"`,
  { stdio: 'inherit' },
);

// Cleanup intermediate files
rmSync(MP4, { force: true });
rmSync(PALETTE, { force: true });

const { statSync } = await import('node:fs');
const sizeMB = (statSync(GIF).size / 1024 / 1024).toFixed(2);
console.log(`✓ GIF created: ${GIF} (${sizeMB} MB)`);
