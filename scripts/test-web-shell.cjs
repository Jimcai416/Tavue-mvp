const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

// Execute the actual exported head script before <body> exists, as browsers do.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tavue-web-shell-'));
try {
  fs.mkdirSync(path.join(temp, 'dist'));
  fs.writeFileSync(path.join(temp, 'dist/index.html'), '<html><head></head><body></body></html>');
  execFileSync(process.execPath, [path.join(__dirname, 'prepare-web.cjs')], { cwd: temp });
  const html = fs.readFileSync(path.join(temp, 'dist/index.html'), 'utf8');
  const script = html.match(/<script id="tavue-visual-viewport">([\s\S]*?)<\/script>/)[1];
  const events = {};
  const properties = {};
  const document = {
    documentElement: { scrollLeft: 23, clientWidth: 430, style: { setProperty(k, v) { properties[k] = v; } } },
    body: null,
    addEventListener(name, fn) { events[name] = fn; },
  };
  const window = { innerHeight: 932, innerWidth: 430, addEventListener() {}, requestAnimationFrame(fn) { fn(); return 1; } };
  vm.runInNewContext(script, { document, window });
  assert.equal(document.documentElement.scrollLeft, 0);
  assert.equal(properties['--tavue-viewport-height'], '932px');
  document.body = { scrollLeft: 45 };
  events.DOMContentLoaded();
  assert.equal(document.body.scrollLeft, 0);
  console.log('PASS: web shell starts before body exists and resets scrolling after DOM ready');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
