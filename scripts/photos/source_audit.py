#!/usr/bin/env python3
"""Bounded, resumable dish-first source research. Never approves or publishes images.

API availability, metadata eligibility, dish identity and display quality are
separate results. No credentials, provider bodies or authenticated URLs are logged.
"""
import argparse
import collections
import concurrent.futures
import datetime
import gzip
import html
import json
import os
import re
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from collect import api as commons_api, candidate, connect

UA = 'TavueSourceAudit/1.0 (https://github.com/Jimcai416/Tavue-mvp)'
KEY_ROUTES = {
    'pexels': ['PEXELS_API_KEY'],
    'unsplash': ['UNSPLASH_ACCESS_KEY'],
    'flickr': ['FLICKR_API_KEY'],
    'google_cse': ['GOOGLE_CSE_KEY', 'GOOGLE_CSE_CX'],
    'google_places': ['GOOGLE_MAPS_API_KEY'],
    'fatsecret': ['FATSECRET_CLIENT_ID', 'FATSECRET_CLIENT_SECRET'],
    'edamam': ['EDAMAM_APP_ID', 'EDAMAM_APP_KEY'],
    'spoonacular': ['SPOONACULAR_API_KEY'],
    'tripadvisor': ['TRIPADVISOR_API_KEY'],
}


def fetch_json(url, headers=None):
    req = urllib.request.Request(url, headers={'User-Agent': UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            raw = response.read(8_000_001)
            if len(raw) > 8_000_000:
                raise ValueError('response_too_large')
            data = json.loads(raw)
        if isinstance(data, dict) and data.get('error'):
            raise ValueError('provider_error_envelope')
        return data
    except urllib.error.HTTPError as error:
        # Do not leak request URLs with API keys or upstream response bodies.
        raise RuntimeError('http_' + str(error.code)) from None
    except (TimeoutError, urllib.error.URLError):
        raise RuntimeError('network_error') from None


def endpoint(base, **params):
    return base + '?' + urllib.parse.urlencode(params)


def commons(dish, limit):
    data = commons_api(dict(generator='search', gsrsearch=dish['query'],
        gsrnamespace=6, gsrlimit=limit, prop='imageinfo',
        iiprop='url|size|mime|sha1|extmetadata', iiurlwidth=800))
    if not isinstance(data, dict) or not ('query' in data or 'batchcomplete' in data):
        raise ValueError('invalid_commons_shape')
    pages = sorted(data.get('query', {}).get('pages', {}).values(), key=lambda p: p.get('index', 999))
    good, held = [], []
    for page in pages:
        record, reason = candidate(page, 'Dish-first search: ' + dish['query'])
        if record:
            good.append(record)
        else:
            held.append({'id': 'commons-' + str(page['pageid']), 'reason': reason})
    return {'returned': len(pages), 'candidates': good, 'held': held}


def commons_photos(dish, limit):
    """An explicit alternate query, not an unrecorded relaxation of a baseline."""
    result = commons({**dish, 'query': dish['query'] + ' filetype:bitmap'}, limit)
    result['executedQuery'] = dish['query'] + ' filetype:bitmap'
    return result


def wikidata(dish, limit):
    data = fetch_json(endpoint('https://www.wikidata.org/w/api.php', action='wbsearchentities',
        search=dish['query'], language='en', limit=min(5, limit), format='json'))
    if not isinstance(data.get('search'), list):
        raise ValueError('invalid_wikidata_shape')
    entities = data.get('search', [])
    ids = [e['id'] for e in entities]
    if not ids:
        return {'returned': 0, 'candidates': [], 'held': []}
    response = fetch_json(endpoint('https://www.wikidata.org/w/api.php', action='wbgetentities',
        ids='|'.join(ids), props='claims', format='json'))
    if not isinstance(response.get('entities'), dict):
        raise ValueError('invalid_wikidata_shape')
    claims = response['entities']
    files = {}
    for item in entities:
        for claim in claims.get(item['id'], {}).get('claims', {}).get('P18', []):
            name = claim.get('mainsnak', {}).get('datavalue', {}).get('value')
            if isinstance(name, str):
                files.setdefault('File:' + name, []).append({
                    'entity': item['id'], 'label': item.get('label'), 'description': item.get('description')})
    if not files:
        return {'returned': len(entities), 'candidates': [], 'held': []}
    # P18 is a discovery hint, NOT proof that an entity is food or the exact dish.
    pages = commons_api(dict(titles='|'.join(list(files)[:10]), prop='imageinfo',
        iiprop='url|size|mime|sha1|extmetadata', iiurlwidth=800)).get('query', {}).get('pages', {})
    good, held = [], []
    for page in pages.values():
        if 'missing' in page:
            continue
        record, reason = candidate(page, 'Wikidata P18 search: ' + dish['query'])
        if record:
            record['entityHints'] = files.get(page['title'], [])
            good.append(record)
        else:
            held.append({'id': 'commons-' + str(page['pageid']), 'reason': reason})
    return {'returned': len(entities), 'candidates': good, 'held': held}


def mealdb(dish, limit):
    data = fetch_json(endpoint('https://www.themealdb.com/api/json/v1/1/search.php', s=dish['query']))
    if 'meals' not in data:
        raise ValueError('invalid_mealdb_shape')
    meals = data['meals'] or []
    return {'returned': len(meals), 'candidates': [dict(
        id='mealdb-' + m['idMeal'], source='themealdb', title=m['strMeal'],
        sourceUrl='https://www.themealdb.com/meal/' + m['idMeal'],
        recipeSourceUrl=m.get('strSource'), previewUrl=m['strMealThumb'],
        author=m.get('strImageSource') or '', license='TheMealDB API terms; paid publication required',
        licenseUrl='https://www.themealdb.com/terms_of_use.php',
        creativeCommonsFlag=m.get('strCreativeCommons'), status='pending_review', approved=False,
        publicationHolds=['paid_api_access_required', 'verify_artwork_rights_and_credit', 'identity_and_quality_review'],
    ) for m in meals[:limit] if m.get('strMealThumb')], 'held': []}


def openverse(dish, limit):
    data = fetch_json(endpoint('https://api.openverse.org/v1/images/', q=dish['query'],
        page_size=limit, license_type='commercial', filter_dead=True))
    if 'results' not in data:
        raise ValueError('invalid_openverse_shape')
    good, held = [], []
    for item in data['results']:
        if item.get('license') not in ('by', 'by-sa', 'cc0', 'pdm'):
            held.append({'id': item.get('id'), 'reason': 'licence_not_allowlisted'})
            continue
        good.append(dict(id='openverse-' + item['id'], source='openverse',
            title=item.get('title'), sourceUrl=item.get('foreign_landing_url'),
            previewUrl=item.get('thumbnail') or item.get('url'), originalUrl=item.get('url'),
            author=item.get('creator'), license=item.get('license'), licenseUrl=item.get('license_url'),
            status='pending_review', approved=False,
            publicationHolds=['verify_original_source_licence', 'identity_and_quality_review']))
    return {'returned': len(data['results']), 'candidates': good, 'held': held}


PROVIDERS = {'commons': commons, 'wikidata': wikidata, 'themealdb': mealdb, 'openverse': openverse, 'commons_photos': commons_photos}


def run_one(source, dish, limit):
    start = time.monotonic()
    try:
        result = PROVIDERS[source](dish, limit)
        return dict(source=source, dish=dish, outcome='ok', **result,
                    elapsedMs=round(1000 * (time.monotonic() - start)))
    except Exception as error:
        code = str(error) if re.fullmatch(r'(http_\d{3}|network_error|provider_error_envelope|invalid_\w+_shape|response_too_large)', str(error)) else type(error).__name__
        return dict(source=source, dish=dish, outcome='error', error=code,
                    elapsedMs=round(1000 * (time.monotonic() - start)))


def summarize(rows, expected):
    result = {}
    for source in sorted({r['source'] for r in rows}):
        group = [r for r in rows if r['source'] == source]
        ok = [r for r in group if r['outcome'] == 'ok']
        photos = [p for r in ok for p in r.get('candidates', [])]
        positive = [r for r in ok if not r['dish'].get('negativeControl')]
        controls = [r for r in ok if r['dish'].get('negativeControl')]
        by_cuisine = {}
        for cuisine in sorted({r['dish']['cuisine'] for r in positive}):
            subset = [r for r in positive if r['dish']['cuisine'] == cuisine]
            by_cuisine[cuisine] = {'successfulRequests': len(subset), 'withCandidates': sum(bool(r.get('candidates')) for r in subset)}
        result[source] = dict(expectedDishes=expected, attemptedDishes=len(group),
            successfulRequests=len(ok), errors=len(group) - len(ok),
            dishesWithCandidates=sum(bool(r.get('candidates')) for r in ok),
            candidateAssociations=len(photos), distinctCandidateIds=len({p['id'] for p in photos}),
            distinctCommonsSourceHashes=len({p['commonsSha1'] for p in photos if p.get('commonsSha1')}),
            approvedPhotos=0, identityVerifiedDishes=0,
            positiveDishesTested=len(positive), positiveDishesWithCandidates=sum(bool(r.get('candidates')) for r in positive),
            negativeControlsTested=len(controls), negativeControlsWithCandidates=sum(bool(r.get('candidates')) for r in controls),
            byCuisine=by_cuisine,
            errorsByCode=dict(collections.Counter(r.get('error') for r in group if r['outcome'] != 'ok')))
    return result


def write_review(rows, out):
    cards = []
    for row in rows:
        for p in row.get('candidates', []):
            # Only display HTTPS links. Metadata is never treated as markup.
            safe = lambda u: u if isinstance(u, str) and u.startswith('https://') else ''
            esc = lambda x: html.escape(str(x or ''), quote=True)
            search = ' '.join([row['dish']['name'], row['source'], str(p.get('title') or '')])
            cards.append('<article data-source="' + esc(row['source']) + '" data-search="' + esc(search) + '"><p>' + esc(row['dish']['name']) + ' · ' + esc(row['source']) + '</p>'
                + '<img loading="lazy" src="' + esc(safe(p.get('previewUrl'))) + '" alt="Unreviewed candidate">'
                + '<h2>' + esc(p.get('title')) + '</h2><p>' + esc(p.get('author')) + '</p>'
                + '<a target="_blank" rel="noopener noreferrer" href="' + esc(safe(p.get('sourceUrl'))) + '">Source</a> · '
                + '<a target="_blank" rel="noopener noreferrer" href="' + esc(safe(p.get('licenseUrl'))) + '">' + esc(p.get('license')) + '</a>'
                + '<p>' + esc(p.get('id')) + '</p><p>Pending identity, quality and provenance review</p></article>')
    options = ''.join('<option>' + html.escape(s) + '</option>' for s in sorted({r['source'] for r in rows}))
    content = '<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tavue source audit</title><style>body{font:15px system-ui;background:#fffaf3;color:#312523;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}article{background:white;padding:16px;border:1px solid #eadfd7;border-radius:14px;overflow-wrap:anywhere}article[hidden]{display:none}img{width:100%;height:240px;object-fit:contain}h2{font-size:16px}a{color:#b9513e}header{position:sticky;top:0;background:#fffaf3;padding:12px 0;z-index:2}input,select{padding:12px;margin-right:8px;max-width:90%}</style><h1>Tavue — dish-first photo candidates</h1><p>Research only. No candidate is approved by this benchmark. Images load from source hosts. Review matched recipe and variant, actual photographic quality, current licence and creator credit before publication.</p><header><input id="query" aria-label="Find a dish" placeholder="Find a dish or file title"><select id="source" aria-label="Source"><option value="">All sources</option>' + options + '</select><span id="count"></span></header><main>' + ''.join(cards) + '''</main><script>
const norm=s=>s.normalize('NFKD').replace(/\\p{M}/gu,'').toLowerCase();
const query=document.getElementById('query'),source=document.getElementById('source');
const cards=[...document.querySelectorAll('article')];
function filter(){let count=0;for(const card of cards){card.hidden=!(norm(card.dataset.search).includes(norm(query.value))&&(!source.value||card.dataset.source===source.value));if(!card.hidden)count++;}document.getElementById('count').textContent=count+' candidate associations; 0 approved';}
query.oninput=filter;source.onchange=filter;filter();
</script>'''
    (out / 'review.html').write_text(content, encoding='utf-8')


def export_commons(rows, path):
    """Bridge real Commons candidates into the existing human review workflow."""
    db = connect(path)
    count = 0
    for row in rows:
        if row.get('dish', {}).get('negativeControl'):
            continue
        for p in row.get('candidates', []):
            if p.get('source') != 'commons':
                continue
            # Retain a single source record per page; associations remain in results.
            cursor = db.execute('INSERT OR IGNORE INTO files(pageid,title,category,status,sha1,record) VALUES(?,?,?,?,?,?)',
                (p['sourcePageId'], p['title'], p['discoveryCategory'], 'pending_review', p['commonsSha1'], json.dumps(p, ensure_ascii=False)))
            count += cursor.rowcount
    db.commit()
    db.close()
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dishes', default='benchmarks/photos/dishes.json')
    parser.add_argument('--out', default='catalog/work/source-audit')
    parser.add_argument('--sources', nargs='+', choices=list(PROVIDERS), default=['commons', 'wikidata', 'themealdb', 'openverse'])
    parser.add_argument('--limit', type=int, default=5, help='Results per dish/source (1–10)')
    parser.add_argument('--dish-limit', type=int)
    parser.add_argument('--workers', type=int, choices=[1, 2, 3], default=3)
    parser.add_argument('--export-commons-db')
    args = parser.parse_args()
    if not 1 <= args.limit <= 10:
        parser.error('--limit must be 1–10')
    dishes = json.loads(Path(args.dishes).read_text(encoding='utf-8'))
    if args.dish_limit:
        dishes = dishes[:args.dish_limit]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    config = {'dishes': dishes, 'sources': args.sources, 'limit': args.limit}
    manifest = out / 'manifest.json'
    if manifest.exists() and json.loads(manifest.read_text()) != config:
        parser.error('Existing run has a different manifest; choose a new output directory')
    manifest.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    journal = out / 'results.jsonl'
    rows = [json.loads(line) for line in journal.read_text(encoding='utf-8').splitlines()] if journal.exists() else []
    done = {(r['source'], r['dish']['name']) for r in rows}
    statuses = {}
    # Preflight once, then bounded batches. At most three network requests are
    # active globally, including nested Wikidata/Commons operations. A denied
    # source is not hammered with an entire submitted request queue.
    # Finish inexpensive independent sources before the multi-hop entity route.
    for source in sorted(args.sources, key=lambda s: {'commons': 0, 'commons_photos': 0, 'themealdb': 1, 'openverse': 2, 'wikidata': 3}[s]):
        previous_error = next((r for r in rows if r['source'] == source and r.get('error') in ('http_401', 'http_403', 'http_429')), None)
        if previous_error:
            statuses[source] = {'status': 'blocked', 'reason': previous_error['error']}
            continue
        pending = [d for d in dishes if (source, d['name']) not in done]
        first = True
        while pending:
            size = 1 if first else args.workers
            batch, pending = pending[:size], pending[size:]
            first = False
            with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
                for row in pool.map(lambda dish: run_one(source, dish, args.limit), batch):
                    with journal.open('a', encoding='utf-8') as file:
                        file.write(json.dumps(row, ensure_ascii=False) + '\n')
                    rows.append(row)
                    print(json.dumps({'source': source, 'dish': row['dish']['name'], 'outcome': row['outcome'], 'candidates': len(row.get('candidates', [])), 'error': row.get('error')}), flush=True)
                    if row.get('error') in ('http_401', 'http_403', 'http_429'):
                        statuses[source] = {'status': 'blocked', 'reason': row['error']}
            if source in statuses:
                break
            time.sleep(.35)
        if source not in statuses:
            statuses[source] = {'status': 'completed' if sum(r['source'] == source for r in rows) == len(dishes) else 'partial'}
    for source, keys in KEY_ROUTES.items():
        statuses[source] = {'status': 'not_live_tested', 'reason': 'credentials_unavailable' if not all(os.environ.get(k) for k in keys) else 'provider_specific_authorisation_and_fixture_required', 'requiredEnvironmentNames': keys}
    report = dict(createdAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        publicationReady=False, dishCount=len(dishes),
        metricUnit='One row is one dish/source lookup, which may use multiple HTTP calls. Candidate associations are not verified dish coverage.',
        metrics=summarize(rows, len(dishes)), routeStatus=statuses)
    unique = {p['id']: p for row in rows if not row['dish'].get('negativeControl')
              for p in row.get('candidates', []) if p.get('source') == 'commons'}
    with gzip.open(out / 'commons-candidates.jsonl.gz', 'wt', encoding='utf-8') as file:
        for photo in sorted(unique.values(), key=lambda p: p['id']):
            file.write(json.dumps(photo, ensure_ascii=False) + '\n')
    report['distinctCommonsReviewCandidates'] = len(unique)
    if args.export_commons_db:
        report['newCommonsReviewRecords'] = export_commons(rows, args.export_commons_db)
    (out / 'summary.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    write_review(rows, out)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
