"""Verify saved crop decisions cover exactly the frozen queue and match bundled bytes."""
import collections
import gzip
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / 'catalog/review-runs/2026-11-17/crop-continuous-review'
def read(path): return json.loads(path.read_text(encoding='utf-8'))
def zipped(name): return json.loads(gzip.decompress((REVIEW/name).read_bytes()))
def audit():
 manifest = zipped('frozen-review-manifest.json.gz')
 assert len(manifest)==3697
 expected = {r['id']:r for r in manifest}
 assert len(expected)==len(manifest)
 assert all(r['originalDecision']=='crop_candidate' and r['approved'] is False for r in manifest)
 decisions=[]; approved=[]; all_checks={}
 for f in sorted(REVIEW.glob('batch-*-decisions.json')):
  rows=read(f); assert len(rows)==(97 if f.name.startswith('batch-37-') else 100)
  decisions.extend(rows)
  checks={r['id']:r for r in read(f.with_name(f.name.replace('-decisions','-source-checks')))}
  assert set(checks)=={r['id'] for r in rows}
  all_checks.update(checks)
  approved.extend(read(f.with_name(f.name.replace('-decisions','-approved'))))
 assert len(decisions)==len(expected) and len({r['id'] for r in decisions})==len(decisions)
 assert {r['id'] for r in decisions}==set(expected)
 for r in decisions:
  assert r['sourceSha1']==expected[r['id']]['sourceSha1']
  assert r['originalQueue']=='crop_candidate' and r['reason'].strip()
  assert r['verdict']==('approved' if r['approved'] else 'held')
  if r['approved']:
   assert r['enlargedPreviewReviewed'] and r['phonePreviewReviewed'] and r['liveMetadataConsistent']
   assert all(r['checks'].values()) and all_checks[r['id']]['consistent']
   assert all_checks[r['id']]['sourceSha1']==r['sourceSha1']
 assert {r['id'] for r in approved}=={r['id'] for r in decisions if r['approved']}
 assert len(approved)==sum(r['approved'] for r in decisions)
 assert zipped('remaining-review-manifest.json.gz')==[]
 assert zipped('held-review-manifest.json.gz')==[r for r in decisions if not r['approved']]
 text=(ROOT/'shared/reviewedDishPhotos.ts').read_text(encoding='utf-8')
 catalogue=json.loads(text.split('= ',1)[1].strip().removesuffix(';'))
 byid={r['id']:r for r in catalogue}; credits=(ROOT/'assets/dishes/CREDITS.md').read_text(encoding='utf-8')
 ds={r['id']:r for r in decisions}
 for r in approved:
  assert r==byid[r['id']]
  assert r['requiresExactMenuName'] and r['aliases']==[] and r['approved']
  digest=hashlib.sha256((ROOT/'assets/dishes'/r['asset']).read_bytes()).hexdigest()
  assert digest==r['assetSha256']==ds[r['id']]['assetSha256']
  line=next(s for s in credits.splitlines() if f"`{r['asset']}`" in s)
  assert r['author'] in line and r['sourceUrl'] in line and r['licenseUrl'] in line
  if r.get('authorUrl'): assert r['authorUrl'] in line
 asset_hashes=[hashlib.sha256(f.read_bytes()).hexdigest() for f in (ROOT/'assets/dishes').glob('*') if f.suffix in {'.jpg','.png'}]
 assert len(asset_hashes)==len(set(asset_hashes))==48+len(catalogue)
 assert len({r['commonsSha1'] for r in catalogue})==len(catalogue)
 progress=read(REVIEW/'progress.json')
 assert progress['finalReviewed']==len(decisions) and progress['newApproved']==len(approved)
 assert progress['held']==len(decisions)-len(approved) and progress['remainingToReview']==0
 # The crop audit is a completed historical queue. Later reviewed intakes may
 # increase the live catalogue without changing this frozen checkpoint.
 assert progress['bundledPhotos']<=len(asset_hashes)
 return {'queueAtStart':len(manifest),'reviewed':len(decisions),'approved':len(approved),'held':len(decisions)-len(approved),'remainingInThisQueue':0,'enlargedPreviews':sum(r['enlargedPreviewReviewed'] for r in decisions),'phonePreviews':sum(r['phonePreviewReviewed'] for r in decisions),'liveMetadataConsistent':sum(r['liveMetadataConsistent'] for r in decisions),'bundledPhotos':len(asset_hashes),'uniqueAssetHashes':len(set(asset_hashes)),'paidModelCalls':0,'launchTarget':10000,'shortfall':10000-len(asset_hashes),'launchReady':False,'productionDeployed':False,'nativeBinaryBuilt':False,'deviceTested':False}
if __name__=='__main__':
 result=audit()
 (REVIEW/'audit.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
 print('PASS: crop queue coverage, source checks, exact catalogue/credits and all delivered hashes:',json.dumps(result))
