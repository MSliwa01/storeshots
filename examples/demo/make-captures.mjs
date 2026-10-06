#!/usr/bin/env node
// Stand-in for `storeshots capture` so the pipeline can be tried without a Mac:
// renders five screens of a fictional plant-care app ("Sprout") at the exact
// simulator size (1320×2868) into app/store/output/raw/iphone-6.9/en/, plus the icon.
// Real projects capture their real app with `storeshots capture` (or `storeshots import`).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import { launchBrowser } from '../../src/browser.mjs';
import { KIT_DIR } from '../../src/paths.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const raw = join(here, 'app/store/output/raw/iphone-6.9/en');
mkdirSync(raw, { recursive: true });

const font = pathToFileURL(join(KIT_DIR, 'fonts/InstrumentSans.ttf')).href;
const shell = body => `<!doctype html><meta charset="utf-8"><style>
  @font-face { font-family: UI; src: url(${font}); font-weight: 400 700; }
  * { box-sizing: border-box; margin: 0; }
  body { width: 440px; height: 956px; font: 16px UI, system-ui, sans-serif; background: #f3f6f2; color: #13261c; }
  .status { height: 54px; display: flex; justify-content: space-between; align-items: end; padding: 0 30px 6px 46px; font-weight: 600; font-size: 17px; }
  .content { padding: 18px 20px; }
  h2 { font-size: 32px; letter-spacing: -.02em; margin: 8px 0 16px; }
  .card { background: #fff; border-radius: 22px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 2px rgba(0,0,0,.06); display: flex; gap: 14px; align-items: center; }
  .dot { width: 54px; height: 54px; border-radius: 16px; display: grid; place-items: center; font-size: 28px; }
  .t { font-weight: 650; font-size: 18px; } .s { color: #5d7266; font-size: 14px; margin-top: 2px; }
  .pill { margin-left: auto; padding: 7px 12px; border-radius: 999px; font-weight: 650; font-size: 13px; }
  .tabs { position: absolute; bottom: 0; left: 0; right: 0; height: 84px; background: #fff; display: flex; justify-content: space-around; padding-top: 12px; color: #8aa093; font-size: 12px; font-weight: 600; }
  .tabs .on { color: #2f9e6e; }
</style><div class="status"><span>9:41</span><span>▮▮▮ ◠ ▭</span></div><div class="content">${body}</div>
<div class="tabs"><span class="on">Today</span><span>Plants</span><span>Calendar</span><span>Settings</span></div>`;

const plant = (emoji, bg, name, note, pill, pillBg) => `<div class="card"><div class="dot" style="background:${bg}">${emoji}</div><div><div class="t">${name}</div><div class="s">${note}</div></div><span class="pill" style="background:${pillBg}">${pill}</span></div>`;

const screens = {
  today: shell(`<h2>Today</h2>
    ${plant('🌿', '#dff3e8', 'Monstera', 'Living room · 250 ml', 'Water now', '#c9f0da')}
    ${plant('🌵', '#f6ecd9', 'Cactus', 'Window · every 14 days', 'In 9 days', '#f1f1ee')}
    ${plant('🌸', '#fbe3ea', 'Orchid', 'Bathroom · mist leaves', 'Tonight', '#ffe1ea')}
    ${plant('🪴', '#e5ecfb', 'Fiddle leaf fig', 'Office · 400 ml', 'Tomorrow', '#e3ebff')}`),
  plant: shell(`<h2>Monstera</h2>
    <div class="card" style="flex-direction:column;align-items:stretch;gap:10px">
      <div style="height:300px;border-radius:16px;background:linear-gradient(160deg,#7fcf9e,#2f9e6e);display:grid;place-items:center;font-size:140px">🌿</div>
      <div class="t">Next watering: today, 18:00</div><div class="s">250 ml · bright indirect light · last fed 12 days ago</div>
    </div>
    ${plant('💧', '#dff3e8', 'Watering', 'Every 7 days', 'On', '#c9f0da')}
    ${plant('🧪', '#f6ecd9', 'Fertiliser', 'Every 4 weeks', 'On', '#f1f1ee')}`),
  calendar: shell(`<h2>October</h2>
    <div class="card" style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;text-align:center;font-weight:600">
      ${Array.from({ length: 31 }, (_, i) => `<div style="padding:10px 0;border-radius:12px;background:${[3, 10, 17, 24, 31].includes(i + 1) ? '#c9f0da' : [7, 21].includes(i + 1) ? '#f6ecd9' : 'transparent'}">${i + 1}</div>`).join('')}
    </div>
    ${plant('💧', '#dff3e8', 'Water 3 plants', 'Friday', '3', '#c9f0da')}`),
  insights: shell(`<h2>Insights</h2>
    <div class="card" style="flex-direction:column;align-items:stretch;gap:6px">
      <div class="s">Watering streak</div><div style="font-size:54px;font-weight:700;letter-spacing:-.03em">21 days</div>
      <div style="display:flex;gap:10px;align-items:end;height:150px;margin-top:10px">${[48, 70, 56, 92, 64, 110, 128].map((h, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px"><div style="width:100%;height:${h}px;border-radius:10px;background:${i === 6 ? '#2f9e6e' : '#c9f0da'}"></div><span class="s">${'MTWTFSS'[i]}</span></div>`).join('')}</div>
    </div>
    ${plant('🌿', '#dff3e8', 'Monstera', '+2 new leaves this month', 'Thriving', '#c9f0da')}
    ${plant('🌸', '#fbe3ea', 'Orchid', 'Flowering since Sep 28', 'Blooming', '#ffe1ea')}`),
  reminders: shell(`<h2>Reminders</h2>
    <div class="card" style="flex-direction:column;align-items:stretch;gap:0;padding:6px 16px">
      ${[['Watering', 'On', true], ['Misting', 'On', true], ['Fertiliser', 'Monthly', false]].map(([t, v, on], i) => `<div style="display:flex;align-items:center;padding:14px 0;${i ? 'border-top:1px solid #edf1ee' : ''}"><div class="t">${t}</div><span style="margin-left:auto;width:52px;height:32px;border-radius:16px;background:${on ? '#34c759' : '#e5e9e6'};position:relative"><span style="position:absolute;top:3px;${on ? 'right' : 'left'}:3px;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2)"></span></span></div>`).join('')}
    </div>
    <div class="card" style="flex-direction:column;align-items:stretch;gap:12px">
      <div class="s">Remind me at</div>
      <div style="display:flex;gap:10px">${['07:30', '18:00', '21:00'].map((t, i) => `<span style="padding:10px 16px;border-radius:14px;font-weight:650;font-size:20px;background:${i === 1 ? '#2f9e6e' : '#f1f4f2'};color:${i === 1 ? '#fff' : '#13261c'}">${t}</span>`).join('')}</div>
      <div class="s">Skips days when it rained on the balcony</div>
    </div>`),
};

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 440, height: 956 }, deviceScaleFactor: 3 });
for (const [id, html] of Object.entries(screens)) {
  await page.setContent(html);
  await page.screenshot({ path: join(raw, `${id}.png`) });
  console.error(`raw ${id}.png`);
}
const icon = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
await icon.setContent('<body style="margin:0;width:1024px;height:1024px;background:linear-gradient(160deg,#5fd39a,#2f9e6e);display:grid;place-items:center;font-size:620px">🌿</body>');
writeFileSync(join(here, 'app/icon.png'), await icon.screenshot());
await browser.close();
