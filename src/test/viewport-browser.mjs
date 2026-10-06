// Run with Node.js on Windows; uses installed Edge and no additional dependencies.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const profile = await mkdtemp(join(tmpdir(), 'soundflex-layout-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5179', '--strictPort'], { stdio: 'ignore' });
const edge = spawn(process.env.SOUNDFLEX_EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=9239', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
let socket;
async function waitFor(url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const response = await fetch(url); if (response.ok) return response; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
try {
  await waitFor('http://127.0.0.1:5179/src/test/viewport.html');
  const pages = await (await waitFor('http://127.0.0.1:9239/json')).json();
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const reply = JSON.parse(data);
    if (pending.has(reply.id)) { pending.get(reply.id)(reply); pending.delete(reply.id); }
  };
  async function command(method, params = {}) {
    const id = ++sequence;
    const reply = await new Promise(resolve => { pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params })); });
    if (reply.error) throw new Error(JSON.stringify(reply.error));
    return reply.result;
  }
  for (const [width, height] of [[3840,2160], [1920,1080], [1366,768], [1280,720], [1024,600], [900,700]]) {
    await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    for (const count of [2, 16, 24]) {
      await command('Page.navigate', { url: `http://127.0.0.1:5179/src/test/viewport.html?count=${count}` });
      let measurement;
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = await command('Runtime.evaluate', { returnByValue: true, expression: `(() => {
          const strips = [...document.querySelectorAll('.input-strip')];
          if (strips.length !== ${count}) return null;
          const errors = [];
          for (const element of document.querySelectorAll('.mixer, .mixer-header, .output-strip, .input-strip, .input-title, .square-button, .track-toggle, .vertical-range, .vu-pair, .channel-choice')) {
            const r = element.getBoundingClientRect();
            if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.width <= 0 || r.height <= 0) errors.push(element.className + ': viewport');
            const strip = element.closest('.input-strip, .output-strip');
            if (strip && strip !== element) { const s = strip.getBoundingClientRect(); if (r.left < s.left - 1 || r.right > s.right + 1 || r.top < s.top - 1 || r.bottom > s.bottom + 1) errors.push(element.className + ': strip'); }
          }
          for (const fader of document.querySelectorAll('.fader')) {
            const range = fader.querySelector('input').getBoundingClientRect();
            const thumbHeight = Math.max(28, 88 * Math.min(innerWidth / 3840, innerHeight / 2160));
            for (const tick of fader.querySelectorAll('.fader-tick')) {
              const r = tick.getBoundingClientRect();
              const fraction = (10 - Number(tick.dataset.db)) / 70;
              const expected = range.top + thumbHeight / 2 + fraction * (range.height - thumbHeight);
              if (Math.abs(r.top + r.height / 2 - expected) > 1) errors.push('tick ' + tick.dataset.db + ': thumb alignment');
            }
          }
          const first = strips[0].getBoundingClientRect();
          const output = document.querySelector('.output-grid').getBoundingClientRect();
          const rows = new Set(strips.map(s => Math.round(s.getBoundingClientRect().top))).size;
          return { errors, rows, outputRatio: output.width / innerWidth, stripRatio: first.width / innerWidth, scroll: document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth };
        })()` });
        measurement = result.result.value;
        if (measurement) break;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.ok(measurement, 'Fixture did not render');
      assert.deepEqual(measurement.errors, [], `${width}x${height}, ${count} inputs`);
      assert.equal(measurement.scroll, false);
      assert.equal(measurement.rows, 2);
      if (width >= 1280) assert.ok(Math.abs(measurement.outputRatio - .085) < .012, 'Reference output-bank ratio');
      if (count === 24 && width >= 1280) assert.ok(Math.abs(measurement.stripRatio - .071) < .008, 'Reference input-strip ratio');
      console.log(`PASS ${width}x${height}, ${count} inputs`);
      if (count === 24 && process.env.SOUNDFLEX_SCREENSHOTS) {
        const directory = process.env.SOUNDFLEX_SCREENSHOTS;
        await mkdir(directory, { recursive: true });
        const capture = await command('Page.captureScreenshot', { format: 'png' });
        await writeFile(join(directory, `edge-${width}x${height}.png`), Buffer.from(capture.data, 'base64'));
        if (process.env.SOUNDFLEX_FIREFOX_PATH) {
          const firefoxProfile = await mkdtemp(join(tmpdir(), 'soundflex-firefox-'));
          try {
            const firefox = spawn(process.env.SOUNDFLEX_FIREFOX_PATH, [
              '--headless', '--no-remote', '--profile', firefoxProfile,
              '--window-size', `${width},${height}`, '--screenshot', join(directory, `firefox-${width}x${height}.png`),
              'http://127.0.0.1:5179/src/test/viewport.html?count=24',
            ], { stdio: 'ignore' });
            await new Promise((resolve, reject) => { firefox.on('error', reject); firefox.on('exit', code => code === 0 ? resolve() : reject(new Error(`Firefox exit ${code}`))); });
          } finally { await rm(firefoxProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
        }
      }
    }
  }
} finally {
  socket?.close();
  edge.kill(); vite.kill();
  await new Promise(resolve => setTimeout(resolve, 500));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
