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
  assert.equal(match('Pancakes'), 'commons-82406191');
  assert.equal(match('Banana pancakes', {translated_name:'Pancakes',image_query:'Pancakes'}), null);
  assert.equal(match('Pancakes with honey'), 'commons-100280051');
  assert.equal(match('Pancakes', {flags:['vegetarian']}), null);
  assert.equal(match('Mexican Style Chicken Salad'), 'commons-37738653');
  assert.equal(match('French style Carbonara', {image_query:'Spaghetti Carbonara'}), null);
  assert.equal(match('Vegan Mexican Style Chicken Salad', {image_query:'Mexican Style Chicken Salad'}), null);
  assert.equal(match('Thai style Mexican Style Chicken Salad', {image_query:'Mexican Style Chicken Salad'}), null);
  assert.equal(match('Moules Normandes'), 'commons-35403633');
  assert.equal(match('Chicken Moules Normandes', {image_dish_name:'Moules Normandes'}), null);
  assert.equal(match('Tajarin al Castelmagno'), 'commons-53778714');
  assert.equal(match('松饼', {translated_name:'Pancakes'}), 'commons-82406191');
  for (const [name, id] of [
    ['Patatas con salsa Las Bravas.', 'patatas-bravas'],
    ['Pincho moruno', 'commons-16288655'],
    ['Pimientos de Padrón (6 uds.)', 'commons-170530392'],
    ['2 × Supplì alla romana', 'commons-167772756'],
    ['Trippa romana', 'commons-78748511'],
    ['6 escargots de Bourgogne', 'commons-37587702'],
    ["Soupe à l'oignon gratinée", 'commons-30767618'],
    ['Tartiflette au reblochon de Savoie', 'tartiflette'],
    ['Tartare de bœuf maison', 'steak-tartare'],
    ['Patatas con alioli (calientes)', 'commons-82307879'],
    ['Boquerones en vinagre', 'commons-162675255'],
    ['Ensaladilla rusa', 'commons-39889554'],
    ['Coda di manzo alla vaccinara', 'commons-19392705'],
    ['Saltimbocca alla romana', 'commons-89957768'],
    ['Pavé de bœuf sauce poivre', 'commons-35198363'],
    ["Gigot d’agneau aux herbes", 'commons-92454432'],
    ['Gambas au four', 'commons-180641631'],
  ]) {
    assert.equal(match(name), id, name);
  }
  for (const [name, hint] of [
    ['Patatas con alioli', 'Patatas Bravas'],
    ['Patatas 2 salsas Las Bravas y alioli', 'Patatas Bravas'],
    ['Pincho moruno de pollo', 'Pincho moruno'],
    ['Boquerones fritos con limón', 'Boquerones en vinagre'],
    ['Supplì alla romana con cacio e pepe', 'Supplì al telefono'],
    ['Amatriciana', "Bucatini all'amatriciana"],
    ['Pizzottella Amatriciana', "Bucatini all'amatriciana"],
    ['Gricia con rucola', 'Strangozzi alla gricia'],
    ['Trippa alla fiorentina con ceci', 'Trippa alla Romana'],
    ['12 escargots à la provençale', 'Escargots de Bourgogne'],
    ['0 escargots de Bourgogne', 'Escargots de Bourgogne'],
    ["Soupe froide à l'oignon", "Soupe à l'oignon"],
    ['Tartiflette au maroilles', 'Tartiflette'],
    ['Tartare de bœuf poêlé', 'Steak Tartare'],
    ['Pavé de bœuf sauce béarnaise', 'Filet mignon au poivre'],
    ["Gigot d’agneau grillé aux herbes", "Gigot d'agneau aux herbes"],
    ['Gambas frites au piment', 'Gambas au four'],
    ['Saltimbocca di pollo', 'Saltimbocca alla romana'],
  ]) {
    assert.equal(match(name, {image_dish_name:hint}), null, name);
  }
  assert.equal(match('Trippa alla fiorentina', {image_dish_name:'Trippa alla Romana'}), 'commons-73795000');
  assert.equal(match('2 Boquerones en vinagre', {image_dish_name:'Boquerones Fritos'}), 'commons-162675255');
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
  console.log(`PASS: photo matching, portion, variant and sanitization checks; ${catalog.length} approved photo records, licences and asset hashes verified.`);
} finally { fs.rmSync(temp, {recursive:true,force:true}); }
