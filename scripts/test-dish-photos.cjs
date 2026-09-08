const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tavue-photo-tests-'));
try {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--module', 'commonjs', '--target', 'ES2022', '--skipLibCheck', '--outDir', temp, 'shared/dishPhotos.ts']);
  const { resolveDishPhoto, attachDishPhoto } = require(path.join(temp, 'dishPhotos.js'));
  const { dishPhotoCatalog: catalog } = require(path.join(temp, 'dishPhotoCatalog.js'));
  const match = (original_name, extra = {}) => resolveDishPhoto({original_name, ...extra})?.id ?? null;
  assert.equal(match('Pasta alla Norma'), 'pasta-alla-norma');
  assert.equal(match('Pasta'), null);
  assert.equal(match('Raw duck'), null);
  assert.equal(match('Chicken carbonara', {image_dish_name: 'Spaghetti Carbonara'}), null);
  assert.equal(match('Vegan carbonara', {image_query: 'Spaghetti Carbonara'}), null);
  assert.equal(match('Vegetarian bibimbap', {image_dish_name: 'Bibimbap'}), null);
  assert.equal(match('Salmon katsudon', {image_dish_name: 'Katsudon'}), null);
  assert.equal(match('Carbonara', {flags:['vegetarian']}), null);
  assert.equal(match('Cacio e Pepe', {flags:['vegan']}), null);
  assert.equal(match('Cacio e Pepe', {flags:['vegetarian']}), 'cacio-e-pepe');
  assert.equal(match('麻婆豆腐'), 'mapo-tofu');
  assert.equal(match('回鍋肉'), 'twice-cooked-pork');
  assert.equal(match('Bánh mì'), 'banh-mi');
  assert.equal(match('  Cacio   e Pepe  '), 'cacio-e-pepe');
  assert.equal(match('Chef surprise', {image_id:'mapo-tofu', image_url:'https://example.com/unlicensed.jpg'}), null);
  const sanitized = attachDishPhoto({original_name:'Unknown dish',image_url:'https://example.com/unlicensed.jpg',image_id:'mapo-tofu'});
  assert.equal(sanitized.image_url, null);
  assert.equal(sanitized.image_id, null);
  for (const photo of catalog) {
    assert.equal(match(photo.name), photo.id, photo.name);
    assert.equal(photo.approved,true);
    assert.equal(photo.kind,'photograph');
    assert.ok(photo.author && photo.title && photo.reviewedAt);
    assert.ok(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/.test(photo.sourceUrl));
    assert.ok(/^https:\/\/creativecommons\.org\//.test(photo.licenseUrl));
    assert.ok(!/NC|ND/.test(photo.license));
    const data = fs.readFileSync(path.join('assets/dishes', photo.asset));
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), photo.assetSha256);
  }
  console.log(`PASS: 17 matching/sanitization checks; ${catalog.length} approved photo records, licences and asset hashes verified.`);
} finally { fs.rmSync(temp, {recursive:true,force:true}); }
