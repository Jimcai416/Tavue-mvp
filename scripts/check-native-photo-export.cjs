// Verify real catalogue bytes survive both native exports; this is not device acceptance.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const directory = process.argv[2] || 'catalog/work/native-export';
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'metadata.json')));
const photos = fs.readdirSync('assets/dishes').filter(name => /\.(jpg|png)$/.test(name));
const expected = new Map(photos.map(name => [name, hash(fs.readFileSync(path.join('assets/dishes', name)))]));
const receipt = { nativeBinaryBuilt: false, deviceTested: false, platforms: {} };
for (const platform of ['ios', 'android']) {
  const exported = metadata.fileMetadata[platform];
  assert.ok(fs.statSync(path.join(directory, exported.bundle)).size > 0, platform + ' bundle missing');
  const hashes = new Set(exported.assets.map(asset => hash(fs.readFileSync(path.join(directory, asset.path.replace(/\\/g, '/'))))));
  for (const [name, digest] of expected) assert.ok(hashes.has(digest), `${platform} missing photo ${name}`);
  receipt.platforms[platform] = { photos: expected.size, bundleSha256: hash(fs.readFileSync(path.join(directory, exported.bundle))) };
}
fs.mkdirSync('ui-results', { recursive: true });
fs.writeFileSync('ui-results/native-photo-export.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(`PASS: all ${photos.length} real photo assets hash-verified in both iOS and Android exports. Device acceptance remains outstanding.`);
