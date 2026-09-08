#!/usr/bin/env python3
"""Prepare an audited D1/R2 release from reviewed records. No remote writes."""
import argparse,datetime,gzip,hashlib,json,re,shutil,sqlite3,unicodedata,urllib.request,urllib.parse
from pathlib import Path
from collect import api,candidate,UA

def normalize(s):return ' '.join(''.join(c if c.isalnum() else ' ' for c in ''.join(c for c in unicodedata.normalize('NFKD',s) if not unicodedata.combining(c)).lower().replace("'",'').replace('’','')).split())
def quote(s):return "'"+str(s).replace("'","''")+"'"
def load_records(candidate_file,decision_file):
 with gzip.open(candidate_file,'rt',encoding='utf-8') as f:records={p['id']:p for p in map(json.loads,f)}
 decisions=json.loads(Path(decision_file).read_text());reviewed=[];seen=set()
 for decision in decisions:
  if decision.get('verdict')!='approved':continue
  pid=decision['id']
  if pid in seen:raise ValueError('Duplicate decision '+pid)
  seen.add(pid);photo=records[pid]
  if decision.get('sourceSha1')!=photo.get('commonsSha1'):raise ValueError('Source changed '+pid)
  if not decision.get('reviewedBy') or not decision.get('reviewedAt') or not decision.get('name'):raise ValueError('Incomplete review '+pid)
  if not all(decision.get('checks',{}).get(k) is True for k in ['identity','quality','provenance','photograph']):raise ValueError('Review checks incomplete '+pid)
  if not set(decision.get('proteins',[])) <= {'chicken','beef','pork','duck','lamb','seafood'}:raise ValueError('Unknown protein tag '+pid)
  if normalize(decision['name']) in {'food','dish','pasta','noodles','rice','meat','soup','salad','curry','dessert','sandwich','cake','bread','lunch','dinner'}:raise ValueError('A food family is not an exact recipe: '+pid)
  photo.update(name=decision['name'],aliases=decision.get('aliases',[]),proteins=decision.get('proteins',[]),cuisine=decision.get('cuisine',''),approved=True,kind='photograph',reviewedAt=decision['reviewedAt'])
  reviewed.append(dict(photo=photo,reviewedBy=decision['reviewedBy']))
 return reviewed

def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--candidates',default='catalog/candidates.jsonl.gz');p.add_argument('--decisions');p.add_argument('--pilot',action='store_true',help='Prepare the 48-photo test collection; explicitly not launch-ready');p.add_argument('--out',default='catalog/work/release');p.add_argument('--min-photos',type=int,default=10000)
 a=p.parse_args()
 if a.pilot:rows=json.loads(Path('catalog/pilot-reviewed.json').read_text())
 elif a.decisions:rows=load_records(a.candidates,a.decisions)
 else:p.error('--decisions is required for a launch catalogue; --pilot is only for testing')
 unique={}
 for row in rows:
  photo=row['photo'];sha=photo.get('commonsSha1') or photo.get('assetSha256')
  if not sha:raise ValueError('Missing source hash')
  if sha not in unique:unique[sha]=row
 rows=list(unique.values());dish_count=len({normalize(r['photo']['name']) for r in rows})
 if not a.pilot and len(rows)<a.min_photos:raise ValueError(f'Launch gate failed: {len(rows)} unique approved photographs; {a.min_photos} required. {dish_count} distinct named dishes.')
 out=Path(a.out)
 if out.exists() and any(out.iterdir()):raise ValueError('Release directory must be empty; use a new versioned path')
 (out/'objects').mkdir(parents=True,exist_ok=True)
 # Revalidate current Commons source hash and licensing before obtaining assets.
 live=[r for r in rows if not r.get('localAsset')]
 for start in range(0,len(live),50):
  group=live[start:start+50];pages=api(dict(pageids='|'.join(str(r['photo']['sourcePageId']) for r in group),prop='imageinfo',iiprop='url|size|mime|sha1|extmetadata',iiurlwidth=960)).get('query',{}).get('pages',{})
  for row in group:
   old=row['photo'];fresh,reason=candidate(pages[str(old['sourcePageId'])],old['discoveryCategory'])
   if not fresh or any(fresh.get(k)!=old.get(k) for k in ['commonsSha1','license','licenseUrl','author']):raise ValueError('Source review stale: '+old['id']+' '+str(reason))
   old['previewUrl']=fresh['previewUrl']
 sql=[Path('catalog/schema.sql').read_text()];manifest=[];aliases={};dishes={}
 for row in rows:
  photo=row['photo'];pid=photo['id']
  if not re.fullmatch('[a-z0-9-]{1,100}',pid):raise ValueError('Unsafe photo id')
  name=photo['name'];did='dish-'+hashlib.sha256(normalize(name).encode()).hexdigest()[:24]
  if row.get('localAsset'):data=Path(row['localAsset']).read_bytes()
  else:
   cache=Path('catalog/work/asset-cache');cache.mkdir(parents=True,exist_ok=True)
   cache_key=hashlib.sha256((photo['commonsSha1']+'|960').encode()).hexdigest()
   cached=cache/cache_key;receipt=cache/(cache_key+'.sha256')
   if cached.exists() and receipt.exists() and hashlib.sha256(cached.read_bytes()).hexdigest()==receipt.read_text():data=cached.read_bytes()
   else:
    with urllib.request.urlopen(urllib.request.Request(photo['previewUrl'],headers={'User-Agent':UA}),timeout=40) as response:data=response.read(8*1024*1024+1)
    if len(data)<=8*1024*1024:cached.write_bytes(data);receipt.write_text(hashlib.sha256(data).hexdigest())
  if len(data)>8*1024*1024:raise ValueError('Oversize image')
  if data.startswith(b'\xff\xd8\xff'):ext='jpg';mime='image/jpeg'
  elif data.startswith(b'\x89PNG\r\n\x1a\n'):ext='png';mime='image/png'
  elif data.startswith(b'RIFF') and data[8:12]==b'WEBP':ext='webp';mime='image/webp'
  else:raise ValueError('Asset is not an accepted image')
  sha=hashlib.sha256(data).hexdigest()
  if photo.get('assetSha256') and sha!=photo['assetSha256']:raise ValueError('Reviewed asset hash mismatch')
  key=f'photos/{pid}/{sha}.{ext}';target=out/'objects'/key;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
  public={k:photo[k] for k in ['id','name','aliases','proteins','approved','kind','title','author','license','licenseUrl','sourceUrl','reviewedAt']};public['deliveryPath']='/'+key
  if did not in dishes:
   dishes[did]=pid;sql.append('INSERT INTO photo_dishes(id,name,cuisine,primary_photo_id) VALUES('+','.join(map(quote,[did,name,photo.get('cuisine',''),pid]))+');')
  for alias in [name]+photo['aliases']:
   alias=normalize(alias)
   if not alias:continue
   if alias in aliases and aliases[alias]!=did:raise ValueError('Ambiguous alias: '+alias)
   if alias not in aliases:aliases[alias]=did;sql.append('INSERT INTO photo_aliases(alias,dish_id) VALUES('+quote(alias)+','+quote(did)+');')
  sql.append('INSERT INTO approved_photos(id,dish_id,status,sha256,r2_key,content_type,metadata_json,reviewed_by,reviewed_at) VALUES('+','.join(map(quote,[pid,did,'approved',sha,key,mime,json.dumps(public,ensure_ascii=False),row['reviewedBy'],photo['reviewedAt']]))+');')
  manifest.append(dict(id=pid,key=key,sha256=sha,contentType=mime,bytes=len(data),sourceUrl=photo['sourceUrl'],license=photo['license'],licenseUrl=photo['licenseUrl'],author=photo['author']))
 # Actual SQL validation catches constraint conflicts before any remote writes.
 connection=sqlite3.connect(':memory:');connection.executescript('\n'.join(sql));connection.close()
 (out/'import.sql').write_text('\n'.join(sql)+'\n');(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 status=dict(approvedPhotos=len(manifest),distinctDishes=dish_count,aliases=len(aliases),bytes=sum(p['bytes'] for p in manifest),launchReady=not a.pilot,minimumPhotos=a.min_photos,createdAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
 (out/'release.json').write_text(json.dumps(status,indent=2)+'\n');shutil.copy('assets/dishes/CREDITS.md',out/'PILOT-CREDITS.md') if a.pilot else None
 print(json.dumps(status))
if __name__=='__main__':main()
