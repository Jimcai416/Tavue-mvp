#!/usr/bin/env python3
"""Freeze a resumable metadata-only queue. Never grants visual or release approval."""
import argparse, collections, gzip, hashlib, json
from pathlib import Path
from calibrate import source_flags


def plan(records, previous=(), batch_size=1000):
    if not 1 <= batch_size <= 1000:
        raise ValueError('batch_size must be 1–1000')
    keys = [(r['id'], r['commonsSha1']) for r in records]
    if len({k[0] for k in keys}) != len(keys):
        raise ValueError('Duplicate candidate IDs')
    saved = collections.defaultdict(list)
    for r in previous:
        sha = r.get('sourceSha1') or r.get('commonsSha1')
        if not sha:
            raise ValueError('Prior result missing source hash; cannot safely skip')
        verdict = r.get('verdict') or r.get('decision')
        if verdict == 'download_failed':
            continue  # Retain in the retry queue; no image was seen.
        if verdict not in {'approved','rejected','display','crop','reject','verify','display_candidate','crop_candidate','shortlist','manual_check'}:
            raise ValueError('Prior record is not a recognized review result')
        saved[(r['id'], sha)].append(r)
    groups = collections.defaultdict(list)
    results = []
    hashes = set()
    for r in sorted(records, key=lambda r: int(r['sourcePageId'])):
        key = (r['id'], r['commonsSha1'])
        flags = source_flags(r)
        if key in saved:
            state = 'prior_result_preserved'
        elif r['commonsSha1'] in hashes:
            state = 'duplicate_source_hash'
        elif flags:
            state = 'hold_missing_metadata'
        else:
            state = 'needs_visual_review'
            groups[r['discoveryCategory']].append(r)
        hashes.add(r['commonsSha1'])
        results.append({'id':r['id'], 'sourceSha1':r['commonsSha1'], 'state':state,
                        'metadataFlags':flags, 'approved':False})
    queue=[]
    for position in range(max((len(g) for g in groups.values()),default=0)):
        for category in sorted(groups):
            if position < len(groups[category]): queue.append(groups[category][position])
    batches=[queue[i:i+batch_size] for i in range(0,len(queue),batch_size)]
    return results,batches


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--catalog', default='catalog/candidates.jsonl.gz')
    p.add_argument('--decisions', action='append', default=[])
    p.add_argument('--out', required=True)
    p.add_argument('--batch-size', type=int, default=1000)
    a=p.parse_args()
    raw=Path(a.catalog).read_bytes()
    records=[json.loads(l) for l in gzip.decompress(raw).decode('utf-8').splitlines() if l.strip()]
    previous=[]
    for name in a.decisions:
        value=json.loads(Path(name).read_text(encoding='utf-8-sig'))
        if isinstance(value,dict):value=value.get('labels',value.get('items'))
        if not isinstance(value,list):raise ValueError('Expected decision array or labels/items list')
        previous.extend(value)
    results,batches=plan(records,previous,a.batch_size)
    out=Path(a.out);out.mkdir(parents=True,exist_ok=False)
    def write(name,value):
        (out/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (out/'metadata-results.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in results),encoding='utf-8')
    for i,b in enumerate(batches,1):
        write(f'batch-{i:03}.json',[{'id':r['id'],'sourceSha1':r['commonsSha1']} for r in b])
    summary={'schema':'tavue-cloud-plan-v1','inputSha256':hashlib.sha256(raw).hexdigest(),
             'total':len(records),'states':dict(collections.Counter(r['state'] for r in results)),
             'categories':dict(collections.Counter(r['discoveryCategory'] for r in records)),
             'licenses':dict(collections.Counter(r['license'] for r in records)),
             'batchSizes':[len(b) for b in batches], 'priorResultsSupplied':len(previous),
             'visuallyReviewedThisRun':0,'approvedThisRun':0,
             'note':'Metadata and scheduling only. No photograph was viewed by this command. Prior results are preserved without interpreting approval.'}
    write('summary.json',summary)
    print(json.dumps(summary,ensure_ascii=False))

if __name__=='__main__':main()
