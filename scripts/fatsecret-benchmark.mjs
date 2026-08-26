import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const DEFAULT_DATASET = path.join(ROOT, 'benchmarks', 'fatsecret', 'dishes.json');
const OUT_DIR = path.join(ROOT, 'benchmarks', 'fatsecret', 'results');

loadEnvFile(path.join(ROOT, '.env.local'));
loadEnvFile(path.join(ROOT, '.env'));

const clientId = process.env.FATSECRET_CLIENT_ID;
const clientSecret = process.env.FATSECRET_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error('Missing FATSECRET_CLIENT_ID or FATSECRET_CLIENT_SECRET.');
  console.error('Add them to .env.local or export them in your shell. Never commit the secret.');
  process.exit(1);
}

const datasetPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_DATASET;
if (!fs.existsSync(datasetPath)) {
  console.error(`Dataset not found: ${datasetPath}`);
  process.exit(1);
}

const dishes = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
if (!Array.isArray(dishes) || !dishes.length) {
  console.error('Dataset must be a non-empty JSON array.');
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const token = await getAccessToken(clientId, clientSecret);
const results = [];

console.log(`Testing ${dishes.length} dishes against FatSecret foods.search.v5...`);

for (let i = 0; i < dishes.length; i += 1) {
  const dish = dishes[i];
  const query = dish.query || dish.name;
  process.stdout.write(`[${String(i + 1).padStart(2, '0')}/${dishes.length}] ${query} ... `);

  try {
    const response = await searchGenericFoods(token, query);
    const foods = normalizeFoods(response);
    const candidates = foods.slice(0, 5).map(normalizeCandidate);
    const withImages = candidates.filter((candidate) => candidate.images.length > 0);
    const best = withImages[0] || candidates[0] || null;

    results.push({
      ...dish,
      query,
      found: candidates.length > 0,
      has_image: withImages.length > 0,
      best,
      candidates,
      error: null,
    });

    console.log(`${candidates.length} candidates, ${withImages.length} with image`);
  } catch (error) {
    results.push({
      ...dish,
      query,
      found: false,
      has_image: false,
      best: null,
      candidates: [],
      error: error instanceof Error ? error.message : String(error),
    });
    console.log(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Be deliberately gentle even though Premier Free has generous limits.
  await sleep(120);
}

const timestamp = new Date().toISOString();
const summary = buildSummary(results);
const report = { timestamp, dataset: path.relative(ROOT, datasetPath), summary, results };

fs.writeFileSync(path.join(OUT_DIR, 'results.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'results.csv'), buildCsv(results));
fs.writeFileSync(path.join(OUT_DIR, 'review.html'), buildReviewHtml(report));

console.log('\nFatSecret benchmark complete');
console.log(`Found:     ${summary.found}/${summary.total} (${summary.found_pct}%)`);
console.log(`With image:${summary.with_image}/${summary.total} (${summary.with_image_pct}%)`);
console.log(`Errors:    ${summary.errors}`);
console.log(`\nOpen ${path.relative(ROOT, path.join(OUT_DIR, 'review.html'))} to visually score accuracy.`);

async function getAccessToken(id, secret) {
  const basic = Buffer.from(`${id}:${secret}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'client_credentials', scope: 'premier' });
  const response = await fetch('https://oauth.fatsecret.com/connect/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`OAuth failed (${response.status}): ${await response.text()}`);
  }

  const json = await response.json();
  if (!json.access_token) throw new Error('OAuth response did not contain access_token');
  return json.access_token;
}

async function searchGenericFoods(token, query) {
  const params = new URLSearchParams({
    search_expression: query,
    food_type: 'generic',
    include_food_images: 'true',
    max_results: '10',
    format: 'json',
  });

  const response = await fetch(`https://platform.fatsecret.com/rest/foods/search/v5?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Search failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

function normalizeFoods(payload) {
  const raw = payload?.foods?.food;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function normalizeCandidate(food) {
  const rawImages = food?.food_images?.food_image;
  const images = !rawImages ? [] : (Array.isArray(rawImages) ? rawImages : [rawImages])
    .filter(Boolean)
    .map((image) => ({
      url: image.image_url || '',
      type: image.image_type || '',
    }))
    .filter((image) => image.url);

  return {
    food_id: food.food_id ?? null,
    food_name: food.food_name ?? '',
    food_type: food.food_type ?? '',
    food_url: food.food_url ?? '',
    description: food.food_description ?? '',
    images,
  };
}

function buildSummary(results) {
  const total = results.length;
  const found = results.filter((row) => row.found).length;
  const withImage = results.filter((row) => row.has_image).length;
  const errors = results.filter((row) => row.error).length;
  return {
    total,
    found,
    with_image: withImage,
    errors,
    found_pct: total ? Number(((found / total) * 100).toFixed(1)) : 0,
    with_image_pct: total ? Number(((withImage / total) * 100).toFixed(1)) : 0,
  };
}

function buildCsv(results) {
  const header = ['name', 'cuisine', 'difficulty', 'query', 'found', 'has_image', 'best_food_name', 'best_food_id', 'best_image_url', 'manual_score', 'notes'];
  const rows = results.map((row) => [
    row.name,
    row.cuisine,
    row.difficulty,
    row.query,
    row.found,
    row.has_image,
    row.best?.food_name || '',
    row.best?.food_id || '',
    row.best?.images?.[0]?.url || '',
    '',
    '',
  ]);
  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}

function buildReviewHtml(report) {
  const cards = report.results.map((row, index) => {
    const candidates = row.candidates.length
      ? row.candidates.map((candidate, candidateIndex) => {
          const image = candidate.images[0]?.url;
          return `<div class="candidate">
            ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(candidate.food_name)}" loading="lazy">` : '<div class="no-image">No image</div>'}
            <div class="candidate-meta">
              <strong>${escapeHtml(candidate.food_name)}</strong>
              <span>#${candidateIndex + 1} · ID ${escapeHtml(String(candidate.food_id ?? ''))}</span>
            </div>
          </div>`;
        }).join('')
      : `<div class="empty">${escapeHtml(row.error || 'No candidates')}</div>`;

    return `<section class="dish" data-index="${index}">
      <header>
        <div><h2>${escapeHtml(row.name)}</h2><p>${escapeHtml(row.cuisine || '')} · ${escapeHtml(row.difficulty || '')}</p></div>
        <div class="badges"><span>${row.found ? 'FOUND' : 'MISS'}</span><span>${row.has_image ? 'IMAGE' : 'NO IMAGE'}</span></div>
      </header>
      ${row.description ? `<p class="description">${escapeHtml(row.description)}</p>` : ''}
      <div class="candidates">${candidates}</div>
      <div class="score"><span>Manual accuracy:</span><button>0 Wrong</button><button>1 Weak</button><button>2 Good</button><button>3 Exact</button></div>
    </section>`;
  }).join('\n');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FatSecret × Tavue benchmark</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f5f3ef;color:#211f1b}.wrap{max-width:1200px;margin:auto;padding:32px}.summary{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0 28px}.pill{background:white;border:1px solid #ddd5ca;border-radius:999px;padding:10px 14px}.dish{background:white;border:1px solid #ddd5ca;border-radius:18px;padding:20px;margin:0 0 18px}.dish header{display:flex;justify-content:space-between;gap:16px}.dish h2{margin:0}.dish p{margin:4px 0;color:#6a6258}.badges{display:flex;gap:8px;align-items:flex-start}.badges span{font-size:12px;border:1px solid #ddd5ca;border-radius:999px;padding:6px 8px}.description{max-width:850px}.candidates{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:16px}.candidate{border:1px solid #e6dfd6;border-radius:14px;overflow:hidden;background:#faf9f7}.candidate img,.no-image{width:100%;aspect-ratio:4/3;object-fit:cover;background:#ece7df;display:flex;align-items:center;justify-content:center}.candidate-meta{padding:10px;display:flex;flex-direction:column;gap:4px}.candidate-meta span{font-size:12px;color:#7d7469}.score{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:16px}.score button{border:1px solid #ccbfb0;background:#fff;border-radius:10px;padding:8px 10px}.empty{padding:24px;color:#8a3f34;background:#fff1ef;border-radius:12px}
</style></head><body><main class="wrap"><h1>FatSecret × Tavue image benchmark</h1><p>Generated ${escapeHtml(report.timestamp)}</p><div class="summary"><div class="pill">Found ${report.summary.found}/${report.summary.total} (${report.summary.found_pct}%)</div><div class="pill">With image ${report.summary.with_image}/${report.summary.total} (${report.summary.with_image_pct}%)</div><div class="pill">Errors ${report.summary.errors}</div></div>${cards}</main></body></html>`;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return `"${text.replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
