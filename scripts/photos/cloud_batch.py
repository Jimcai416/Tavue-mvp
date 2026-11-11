#!/usr/bin/env python3
"""Bounded cloud calibration. Batch model suggestions never grant release approval."""
import argparse, base64, gzip, hashlib, json, os, subprocess, sys, time, urllib.error
from pathlib import Path
import triage
from download_review import retry_seconds

ROOT=Path(__file__).resolve().parents[2]
CONFIG=ROOT/'catalog/cloud-review-request.json'
OUT=ROOT/'catalog/work/cloud-calibration'

def config():
    c=triage.read_json(CONFIG)
    if c.get('purpose')!='visual-calibration' or not 1<=c.get('maxRequests',0)<=100:
        raise ValueError('Only a bounded 1–100 photo calibration is enabled')
    if c.get('model')!='claude-haiku-4-5-20251001':
        raise ValueError('Unexpected model; review pricing and compatibility before changing')
    return c

def validate():
    c=config();key=triage.api_key()
    data=json.loads(triage.request('models/'+c['model'],key))
    if data.get('id')!=c['model']:raise ValueError('Requested model is not available')
    print(json.dumps({'credentialPresent':True,'modelAvailable':data['id'],'paidRequestsSubmitted':0}))

def prepare():
    c=config();raw=(ROOT/'catalog/candidates.jsonl.gz').read_bytes()
    if hashlib.sha256(raw).hexdigest()!=c['catalogSha256']:raise ValueError('Catalogue changed')
    catalogue={r['id']:r for r in (json.loads(l) for l in gzip.decompress(raw).decode('utf-8').splitlines())}
    refs=triage.read_json(ROOT/c['sample'])
    if len(refs)!=c['maxRequests'] or len({r['id'] for r in refs})!=len(refs):raise ValueError('Sample cap/uniqueness mismatch')
    for ref in refs:
        row=catalogue[ref['id']]
        if row['commonsSha1']!=ref['sourceSha1'] or triage.source_flags(row):raise ValueError('Invalid source snapshot')
    OUT.mkdir(parents=True,exist_ok=True)
    triage.write_json(OUT/'sample-manifest.json',refs,exclusive=True)
    subprocess.run([sys.executable,str(ROOT/'scripts/photos/download_review.py'),'--manifest',str(OUT/'sample-manifest.json'),
                    '--limit',str(len(refs)),'--out',str(OUT/'previews')],cwd=ROOT,check=True)
    downloads=triage.read_json(OUT/'previews/downloads.json')
    if len(downloads)!=len(refs) or any(r['status']!='downloaded' for r in downloads):
        raise ValueError('Not all previews are available; no paid batch prepared')
    requests=[];items={}
    for ref,d in zip(refs,downloads):
        if ref['id']!=d['id']:raise ValueError('Download/sample mismatch')
        r=catalogue[ref['id']];image=(OUT/'previews'/f"{d['number']:03}.jpg").read_bytes()
        requests.append({'custom_id':r['id'],'params':{'model':c['model'],'max_tokens':1200,'system':triage.VISUAL_PROMPT,
          'messages':[{'role':'user','content':[{'type':'image','source':{'type':'base64','media_type':'image/jpeg','data':base64.b64encode(image).decode()}}]}]}})
        items[r['id']]={'evidence':{k:r[k] for k in ('id','title','description','discoveryCategory','sourceUrl','commonsSha1')}}
    batch=OUT/'visual.json';triage.write_json(batch,{'requests':requests},exclusive=True)
    if batch.stat().st_size>triage.MAX_BATCH:raise ValueError('Serialized batch exceeds payload cap')
    triage.write_json(batch.with_suffix('.manifest.json'),{'version':triage.VERSION,'stage':'visual',
      'batch_sha256':hashlib.sha256(batch.read_bytes()).hexdigest(),'items':items},exclusive=True)
    triage.write_json(batch.with_suffix('.sources.json'),{r['id']:r['sourceSha1'] for r in refs},exclusive=True)
    triage.write_json(OUT/'request-config.json',c,exclusive=True)
    print(json.dumps({'prepared':len(requests),'submitted':False,'payloadBytes':batch.stat().st_size}))

def submit():
    c=config()
    if os.environ.get('GITHUB_RUN_ATTEMPT','1')!='1':
        raise ValueError('Rerun cannot resubmit paid requests. Recover receipt/lock artifacts first.')
    saved=triage.read_json(OUT/'request-config.json')
    if saved!=c:raise ValueError('Config changed after preparation')
    subprocess.run([sys.executable,str(ROOT/'scripts/photos/triage.py'),'submit',str(OUT/'visual.json'),
                    '--max-requests',str(c['maxRequests'])],cwd=ROOT,check=True)

def finish():
    result=OUT/'visual.job.results.jsonl'
    payload=triage.rows(result)
    summary=triage.read_json(OUT/'visual.job.results.summary.json')
    baseline={r['id']:r['assistantDecision'] for r in triage.read_json(ROOT/config()['sample'])}
    compared=[]
    for item in summary['items']:
        compared.append({'id':item['custom_id'],'assistantSuggestion':baseline[item['custom_id']],
                         'modelSuggestion':item['decision'],'agrees':baseline[item['custom_id']]==item['decision']})
    usage={'input_tokens':0,'output_tokens':0}
    for r in payload:
        for k in usage:usage[k]+=r.get('result',{}).get('message',{}).get('usage',{}).get(k,0)
    # Published Haiku 4.5 batch rates; estimate from reported uncached tokens.
    cost=usage['input_tokens']*.5/1_000_000+usage['output_tokens']*2.5/1_000_000
    triage.write_json(OUT/'calibration-comparison.json',{'usage':usage,'estimatedBatchCostUSD':cost,
       'note':'Agreement against assistant screening suggestions, not human ground truth or release approval. Cost estimate excludes any cache-specific charges.',
       'comparison':compared,'approved':0})
    print(json.dumps({'completed':len(compared),'usage':usage,'estimatedBatchCostUSD':cost,'approved':0}))

def poll(seconds):
    deadline=time.monotonic()+seconds;job=OUT/'visual.job.json'
    if not job.exists():raise ValueError('No submission receipt; do not submit again automatically')
    while time.monotonic()<deadline:
        try:
            subprocess.run([sys.executable,str(ROOT/'scripts/photos/triage.py'),'collect',str(job)],cwd=ROOT,check=True)
            if (OUT/'visual.job.results.jsonl').exists():finish();return
        except subprocess.CalledProcessError:
            print('Collection read failed; retrying GET only, without resubmitting paid requests.',flush=True)
        for _ in range(24):
            if time.monotonic()>=deadline:break
            time.sleep(5)
    print('Batch may still be running at Anthropic. Receipt is preserved; collect later, never resubmit.',flush=True)

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('command',choices=['validate','prepare','submit','poll'])
    p.add_argument('--seconds',type=int,default=14400);a=p.parse_args()
    if a.command=='poll':poll(a.seconds)
    else:globals()[a.command]()

if __name__=='__main__':main()
