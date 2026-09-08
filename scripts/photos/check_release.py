#!/usr/bin/env python3
"""Verify real release assets and the 10,000-photo gate before cloud upload."""
import argparse,hashlib,json,re,sqlite3
from pathlib import Path

def check(folder):
 root=Path(folder);status=json.loads((root/'release.json').read_text());manifest=json.loads((root/'manifest.json').read_text())
 if status.get('launchReady') is not True or len(manifest)<10000:raise ValueError('Launch requires at least 10,000 approved photographs. A pilot is not a launch release.')
 ids=set();hashes=set()
 for row in manifest:
  key=row['key']
  if not re.fullmatch(r'photos/[a-z0-9-]{1,100}/[a-f0-9]{64}\.(jpg|png|webp)',key):raise ValueError('Invalid asset key')
  data=(root/'objects'/key).read_bytes();digest=hashlib.sha256(data).hexdigest()
  if digest!=row['sha256'] or len(data)!=row['bytes']:raise ValueError('Asset integrity mismatch: '+row['id'])
  if row['id'] in ids or digest in hashes:raise ValueError('Duplicate photo id or image content')
  ids.add(row['id']);hashes.add(digest)
 c=sqlite3.connect(':memory:');c.executescript((root/'import.sql').read_text())
 published=c.execute("SELECT id,sha256,r2_key FROM approved_photos WHERE status='approved'").fetchall()
 if {(p[0],p[1],p[2]) for p in published}!={(p['id'],p['sha256'],p['key']) for p in manifest}:raise ValueError('SQL catalogue and assets differ')
 if c.execute('SELECT count(*) FROM photo_dishes WHERE primary_photo_id NOT IN (SELECT id FROM approved_photos WHERE status=\'approved\') OR primary_photo_id IS NULL').fetchone()[0]:raise ValueError('Dish has no approved primary image')
 print(json.dumps({'verifiedPhotos':len(manifest),'distinctDishes':c.execute('SELECT count(*) FROM photo_dishes').fetchone()[0],'launchReady':True}))
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('folder');a=p.parse_args();check(a.folder)
