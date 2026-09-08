#!/usr/bin/env python3
"""Resumable Commons candidate discovery. Never approves or publishes a photograph."""
import argparse, collections, concurrent.futures, datetime, gzip, hashlib, html, json, re, sqlite3, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

ROOTS = ['Pasta dishes','Noodle dishes','Rice dishes','Soups','Stews','Dumplings','Salads','Sandwiches','Pancakes','Pies','Curries','Meat dishes','Seafood dishes','Egg dishes','Desserts','Pastries','Cakes','Breads','Dishes (cuisine) by country','Food dishes by type']
SKIP = re.compile(r'\b(art|paintings|drawings|illustrations|AI.generated|diagrams|maps|logos|videos|menus|packaging|advertisements|equipment|utensils|cookbooks|raw|uncooked|manufacturing|factories|shops|restaurants|people|eating|preparation|sculptures|posters|stamps)\b',re.I)
LICENCE = re.compile(r'^CC BY(?:-SA)? (?:1\.0|2\.0|2\.5|3\.0|4\.0)$')
UA = 'TavuePhotoCatalogue/1.0 (https://github.com/Jimcai416/Tavue-mvp)'

def plain(value):return html.unescape(re.sub('<[^>]*>',' ',value or '')).strip()
def connect(file):
 Path(file).parent.mkdir(parents=True,exist_ok=True)
 db=sqlite3.connect(file)
 db.executescript('''PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS categories(title TEXT PRIMARY KEY,depth INTEGER,done INTEGER DEFAULT 0,continuation TEXT);
 CREATE TABLE IF NOT EXISTS files(pageid INTEGER PRIMARY KEY,title TEXT,category TEXT,status TEXT DEFAULT 'discovered',reason TEXT,sha1 TEXT,record TEXT);
 CREATE TABLE IF NOT EXISTS audit(created TEXT,kind TEXT,details TEXT);
 CREATE INDEX IF NOT EXISTS files_status ON files(status);
 CREATE INDEX IF NOT EXISTS files_sha1 ON files(sha1);''')
 columns={r[1] for r in db.execute('PRAGMA table_info(categories)')}
 if 'priority' not in columns:db.execute('ALTER TABLE categories ADD COLUMN priority INTEGER DEFAULT 0')
 if 'ranked' not in columns:db.execute('ALTER TABLE categories ADD COLUMN ranked INTEGER DEFAULT 0')
 db.commit()
 return db

def api(params):
 params=dict(action='query',format='json',maxlag=5,**params)
 url='https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(params)
 for attempt in range(5):
  try:
   with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':UA,'Accept-Encoding':'gzip'}),timeout=40) as res:
    raw=res.read();raw=gzip.decompress(raw) if res.headers.get('Content-Encoding')=='gzip' else raw
    data=json.loads(raw)
   if 'error' in data:
    if data['error'].get('code') in ('maxlag','ratelimited'):time.sleep(min(30,2**attempt));continue
    raise RuntimeError(str(data['error']))
   time.sleep(.25)
   return data
  except urllib.error.HTTPError as error:
   if error.code not in (429,500,502,503,504):raise
   delay=int(error.headers.get('Retry-After','5'))
   if delay>60:raise RuntimeError(f'Source requested a {delay}s pause; resume this command later.') from error
   time.sleep(max(delay,2**attempt))
  except (TimeoutError,urllib.error.URLError):
   if attempt==4:raise
   time.sleep(2**attempt)
 raise RuntimeError('Source remained rate limited; checkpoint retained.')

def candidate(page,category):
 info=(page.get('imageinfo') or [{}])[0];meta=info.get('extmetadata',{})
 val=lambda key:meta.get(key,{}).get('value','')
 license=val('LicenseShortName');author=plain(val('Artist'));description=plain(val('ImageDescription'))
 if info.get('mime') not in ('image/jpeg','image/png','image/webp'):return None,'not_supported_bitmap'
 if not (LICENCE.fullmatch(license) or license in ('CC0','Public domain')):return None,'licence_not_allowlisted'
 if not author or val('Restrictions'):return None,'attribution_or_restrictions'
 if min(info.get('width',0),info.get('height',0))<600:return None,'resolution_below_600'
 if max(info['width'],info['height'])/min(info['width'],info['height'])>2.5:return None,'extreme_aspect_ratio'
 if SKIP.search(page['title']+' '+category+' '+description):return None,'non_dish_or_unwanted_context'
 lu=val('LicenseUrl').replace('http://','https://')
 if license=='CC0' and not lu:lu='https://creativecommons.org/publicdomain/zero/1.0/'
 if license=='Public domain' and not lu:lu='https://creativecommons.org/publicdomain/mark/1.0/'
 if not lu.startswith('https://creativecommons.org/'):return None,'licence_url_missing'
 urls=[info.get('url',''),info.get('thumburl','')]
 if any(urllib.parse.urlparse(u).scheme != 'https' or urllib.parse.urlparse(u).hostname not in ('upload.wikimedia.org','thumb.wikimedia.org') for u in urls):return None,'unexpected_asset_host'
 return dict(id='commons-'+str(page['pageid']),source='commons',sourcePageId=page['pageid'],title=page['title'],discoveryCategory=category,description=description,author=author,license=license,licenseUrl=lu,sourceUrl=info.get('descriptionurl'),originalUrl=info['url'],previewUrl=info['thumburl'],width=info['width'],height=info['height'],commonsSha1=info.get('sha1'),fetchedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),status='pending_review',approved=False),None

def stats(db):return dict(db.execute('SELECT status,count(*) FROM files GROUP BY status').fetchall())
def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--db',default='catalog/work/candidates.sqlite')
 parser.add_argument('--target',type=int,default=15000,help='Unique metadata-eligible candidates, NOT approved photos')
 parser.add_argument('--max-categories',type=int,default=2000)
 parser.add_argument('--depth',type=int,default=4)
 parser.add_argument('--export',default='catalog/candidates.jsonl.gz')
 parser.add_argument('--stats',action='store_true')
 args=parser.parse_args()
 snapshot=Path('catalog/collection.sqlite.gz')
 if not Path(args.db).exists() and snapshot.exists():
  Path(args.db).parent.mkdir(parents=True,exist_ok=True);Path(args.db).write_bytes(gzip.decompress(snapshot.read_bytes()))
 db=connect(args.db)
 if args.stats:print(json.dumps(stats(db)));return
 for root in ROOTS:db.execute('INSERT OR IGNORE INTO categories(title,depth) VALUES(?,0)',('Category:'+root,))
 db.commit();iteration=0
 try:
  while stats(db).get('pending_review',0)<args.target:
   if Path(args.db+'.stop').exists():break
   pending=db.execute("SELECT pageid,category FROM files WHERE status='discovered' LIMIT 150").fetchall()
   if pending:
    def fetch_group(group):
     return api(dict(pageids='|'.join(str(x[0]) for x in group),prop='imageinfo',iiprop='url|size|mime|sha1|extmetadata',iiurlwidth=960)).get('query',{}).get('pages',{})
    pages={}
    # Wikimedia's documented ceiling is three concurrent requests.
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
     for result in pool.map(fetch_group,[pending[i:i+50] for i in range(0,len(pending),50)]):pages.update(result)

    for pid,cat in pending:
     page=pages.get(str(pid),{'pageid':pid,'title':''});record,reason=candidate(page,cat)
     if record and record.get('commonsSha1') and db.execute("SELECT 1 FROM files WHERE sha1=? AND status='pending_review'",(record['commonsSha1'],)).fetchone():record=None;reason='duplicate_sha1'
     db.execute('UPDATE files SET status=?,reason=?,sha1=?,record=? WHERE pageid=?',('pending_review' if record else 'rejected_metadata',reason,record.get('commonsSha1') if record else None,json.dumps(record,ensure_ascii=False) if record else None,pid))
    db.commit();iteration+=1
    if iteration%5==0:print(json.dumps({'counts':stats(db),'categoriesDone':db.execute('SELECT count(*) FROM categories WHERE done=1').fetchone()[0]}),flush=True)
    continue
   if db.execute('SELECT count(*) FROM categories WHERE done=1').fetchone()[0]>=args.max_categories:break
   unranked=[r[0] for r in db.execute('SELECT title FROM categories WHERE done=0 AND ranked=0 LIMIT 50')]
   if unranked:
    rank_pages=api(dict(titles='|'.join(unranked),prop='categoryinfo')).get('query',{}).get('pages',{})
    info={r['title']:r.get('categoryinfo',{}) for r in rank_pages.values()}
    for name in unranked:
     counts=info.get(name,{})
     db.execute('UPDATE categories SET ranked=1,priority=? WHERE title=?',(counts.get('files',0)+5*counts.get('subcats',0),name))
    db.commit();continue
   row=db.execute('SELECT title,depth,continuation FROM categories WHERE done=0 ORDER BY priority DESC,depth,rowid LIMIT 1').fetchone()
   if not row:break
   title,depth,continuation=row
   params=dict(list='categorymembers',cmtitle=title,cmnamespace='6|14',cmlimit=500)
   if continuation:params.update(json.loads(continuation))
   data=api(params)
   for member in data.get('query',{}).get('categorymembers',[]):
    name=member['title']
    if SKIP.search(name):continue
    if member['ns']==14 and depth<args.depth:db.execute('INSERT OR IGNORE INTO categories(title,depth) VALUES(?,?)',(name,depth+1))
    elif member['ns']==6:db.execute('INSERT OR IGNORE INTO files(pageid,title,category) VALUES(?,?,?)',(member['pageid'],name,title))
   cont=data.get('continue')
   db.execute('UPDATE categories SET done=?,continuation=? WHERE title=?',(0 if cont else 1,json.dumps(cont) if cont else None,title));db.commit()
 finally:
  out=Path(args.export);out.parent.mkdir(parents=True,exist_ok=True)
  with gzip.open(out,'wt',encoding='utf-8') as dest:
   for record, in db.execute("SELECT record FROM files WHERE status='pending_review' ORDER BY pageid"):dest.write(record+'\n')
  summary={'counts':stats(db),'approvedByThisCollector':0,'categoriesDone':db.execute('SELECT count(*) FROM categories WHERE done=1').fetchone()[0],'updatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
  backup_path=Path(args.db+'.backup');backup=sqlite3.connect(backup_path);db.backup(backup);backup.close()
  Path('catalog/collection.sqlite.gz').write_bytes(gzip.compress(backup_path.read_bytes()));backup_path.unlink()
  out.with_name('collection-status.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary),flush=True);db.close()
if __name__=='__main__':main()
