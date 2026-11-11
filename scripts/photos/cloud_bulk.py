#!/usr/bin/env python3
"""Resumable visual suggestions with a durable pre-POST lock and token-reserved budget."""
import argparse, base64, concurrent.futures, gzip, hashlib, json, os, shutil, subprocess, sys, time, urllib.error
from pathlib import Path
import triage
from download_review import RateGate,retry_seconds

ROOT=Path(__file__).resolve().parents[2]
MODEL='claude-haiku-4-5-20251001'
STATE_BRANCH='data/cloud-photo-screening-20261111'
GATE=RateGate()
MAX_OUTPUT=1200

def run(*args,**kwargs):return subprocess.run(args,check=True,**kwargs)
def cost(input_tokens,output_tokens):return (input_tokens*.5+output_tokens*2.5)/1_000_000

def api(path,key,body=None,retry_post=False):
    while True:
        GATE.wait()
        try:return triage.request(path,key,body)
        except urllib.error.HTTPError as exc:
            if exc.code==429:
                GATE.pause(retry_seconds(exc.headers.get('Retry-After')))
                print(json.dumps({'apiRateLimited':True,'waitingAtLeastSeconds':120}),flush=True)
                continue # Explicit 429 is a rejected request, not an ambiguous accepted submission.
            if body is None and exc.code in (500,502,503,504):GATE.pause(120);continue
            raise
        except (OSError,TimeoutError):
            if body is not None and not retry_post:raise # Never retry an ambiguous paid POST.
            GATE.pause(120)

def reserve_cost(requests,key):
    def count(entry):
        p=entry['params'];body={k:p[k] for k in ('model','system','messages')}
        d=json.loads(api('messages/count_tokens',key,body,retry_post=True))
        n=d.get('input_tokens')
        if type(n) is not int or n<0:raise ValueError('Invalid token reservation')
        return n
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        tokens=sum(pool.map(count,requests))
    # Token-count estimates can differ slightly from billed usage; pad input reservation.
    return tokens,cost(int(tokens*1.1)+len(requests)*100,len(requests)*MAX_OUTPUT)

def usage_cost(rows):
    if any(r.get('result',{}).get('type')!='succeeded' for r in rows):
        return None # Keep the full reservation when failed-request billing is uncertain.
    usage={'input_tokens':0,'output_tokens':0}
    for r in rows:
        u=r['result']['message'].get('usage',{})
        if any(type(u.get(k)) is not int for k in usage):return None
        if u.get('cache_creation_input_tokens',0) or u.get('cache_read_input_tokens',0):return None
        for k in usage:usage[k]+=u[k]
    return {'usage':usage,'usd':cost(**usage)}

def check_ledger(ledger,batch_size,budget,request_key):
    if ledger.get('requestKey')!=request_key or ledger.get('batchSize')!=batch_size or ledger.get('budgetUSD')!=budget:
        raise ValueError('Resume configuration changed; preserve the existing run configuration')
    ambiguous=[x for x in ledger['batches'] if x['status'] in ('reserved','ambiguous_submission')]
    if ambiguous:raise ValueError('Ambiguous submission lock exists. Inspect provider jobs before any new paid POST.')

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--budget',type=float,default=15)
    p.add_argument('--batch-size',type=int,default=200)
    p.add_argument('--seconds',type=int,default=17400)
    a=p.parse_args()
    if not 1<=a.batch_size<=200 or not 0<a.budget<=15:raise ValueError('Invalid request/budget cap')
    key=triage.api_key()
    config=json.loads((ROOT/'catalog/cloud-bulk-request.json').read_text())
    expected=config['catalogSha256'];raw=(ROOT/'catalog/candidates.jsonl.gz').read_bytes()
    if hashlib.sha256(raw).hexdigest()!=expected:raise ValueError('Catalogue changed')
    records={r['id']:r for r in (json.loads(l) for l in gzip.decompress(raw).decode().splitlines())}
    refs=[]
    for f in sorted((ROOT/'catalog/review-runs/2026-11-11/remaining-after-002').glob('batch-*.json')):refs+=json.loads(f.read_text())
    if len(refs)!=7833 or len({r['id'] for r in refs})!=len(refs):raise ValueError('Unexpected queue size/duplicate IDs')
    for ref in refs:
        if records[ref['id']]['commonsSha1']!=ref['sourceSha1']:raise ValueError('Queue hash mismatch')
    request_key=hashlib.sha256(json.dumps({'refs':refs,'config':config},sort_keys=True).encode()).hexdigest()
    state=ROOT/'catalog/work/progress-checkout'
    state.parent.mkdir(parents=True,exist_ok=True)
    probe=subprocess.run(['git','ls-remote','--exit-code','--heads','origin',STATE_BRANCH],cwd=ROOT,capture_output=True,text=True)
    if probe.returncode==0:
        run('git','fetch','origin',STATE_BRANCH,cwd=ROOT)
        run('git','worktree','add','--detach',str(state),'FETCH_HEAD',cwd=ROOT)
    elif probe.returncode==2:run('git','worktree','add','--detach',str(state),'HEAD',cwd=ROOT)
    else:raise RuntimeError('Cannot resolve durable state branch')
    dest=state/'catalog/cloud-progress';dest.mkdir(parents=True,exist_ok=True)
    ledger_file=dest/'ledger.json'
    ledger=json.loads(ledger_file.read_text()) if ledger_file.exists() else {
      'requestKey':request_key,'model':MODEL,'queueSize':len(refs),'batchSize':a.batch_size,'budgetUSD':a.budget,
      'approved':0,'batches':[],'purpose':'Visual suggestions; identity, rights and authenticity not approved.'}
    check_ledger(ledger,a.batch_size,a.budget,request_key)
    def persist(message):
        triage.write_json(ledger_file,ledger)
        run('git','add','catalog/cloud-progress',cwd=state)
        change=subprocess.run(['git','diff','--cached','--quiet'],cwd=state)
        if change.returncode:
            run('git','-c','user.name=Tavue photo worker','-c','user.email=photo-worker@users.noreply.github.com','commit','-m',message,cwd=state)
            run('git','push','origin',f'HEAD:refs/heads/{STATE_BRANCH}',cwd=state)
    started=time.monotonic();spent=sum(x.get('accountedUSD',x.get('reservedUSD',0)) for x in ledger['batches'])
    for index,start in enumerate(range(0,len(refs),a.batch_size)):
        if time.monotonic()-started>a.seconds:ledger['runStatus']='paused_time_limit';persist('Checkpoint photo screening time limit');return
        previous=next((x for x in ledger['batches'] if x['index']==index),None)
        if previous and previous['status']=='completed':continue
        batch_refs=refs[start:start+a.batch_size];work=ROOT/f'catalog/work/bulk-{index:03}'
        work.mkdir(parents=True,exist_ok=True)
        batch=work/'visual.json';manifest_file=work/'visual.manifest.json'
        record=previous
        if record is None:
            triage.write_json(work/'sample-manifest.json',batch_refs)
            run(sys.executable,str(ROOT/'scripts/photos/download_review.py'),'--manifest',str(work/'sample-manifest.json'),
                '--limit',str(len(batch_refs)),'--out',str(work/'previews'),cwd=ROOT)
            downloads=triage.read_json(work/'previews/downloads.json');requests=[];items={};failed=[]
            for ref,d in zip(batch_refs,downloads):
                if ref['id']!=d['id']:raise ValueError('Download order mismatch')
                if d['status']!='downloaded':failed.append({'id':ref['id'],'sourceSha1':ref['sourceSha1'],'error':d.get('error')});continue
                r=records[ref['id']];data=(work/'previews'/f"{d['number']:03}.jpg").read_bytes()
                if triage.source_flags(r):raise ValueError('Incomplete source record')
                requests.append({'custom_id':r['id'],'params':{'model':MODEL,'max_tokens':MAX_OUTPUT,'system':triage.VISUAL_PROMPT,
                  'messages':[{'role':'user','content':[{'type':'image','source':{'type':'base64','media_type':'image/jpeg','data':base64.b64encode(data).decode()}}]}]}})
                items[r['id']]={'evidence':{k:r[k] for k in ('id','title','description','discoveryCategory','sourceUrl','commonsSha1')}}
            triage.write_json(dest/f'batch-{index:03}-download-failures.json',failed)
            if not requests:
                ledger['batches'].append({'index':index,'status':'completed','apiRequests':0,'downloadFailed':failed,'accountedUSD':0,'counts':{}})
                persist(f'Checkpoint empty photo batch {index}');continue
            triage.write_json(batch,{'requests':requests})
            if batch.stat().st_size>triage.MAX_BATCH:raise ValueError('Payload cap exceeded')
            manifest={'version':triage.VERSION,'stage':'visual','batch_sha256':hashlib.sha256(batch.read_bytes()).hexdigest(),'items':items}
            triage.write_json(manifest_file,manifest)
            input_tokens,reservation=reserve_cost(requests,key)
            if spent+reservation>a.budget:
                ledger.update(runStatus='paused_budget',accountedUSD=spent,nextReservationUSD=reservation)
                persist('Pause before paid submission at photo review budget cap');return
            record={'index':index,'status':'reserved','apiRequests':len(requests),'reservedUSD':reservation,
                    'countedInputTokens':input_tokens,'downloadFailed':failed,'requestSha256':manifest['batch_sha256']}
            ledger['batches'].append(record)
            triage.write_json(dest/f'batch-{index:03}-manifest.json',manifest)
            persist(f'Reserve photo batch {index} before paid POST')
            try:receipt=json.loads(api('messages/batches',key,triage.read_json(batch)))
            except Exception:
                record['status']='ambiguous_submission';persist(f'Hold ambiguous photo batch {index} without resubmission');raise
            record.update(status='submitted',jobId=receipt['id']);triage.write_json(dest/f'batch-{index:03}-receipt.json',receipt)
            persist(f'Checkpoint submitted photo batch {index}')
        else:
            manifest=json.loads((dest/f'batch-{index:03}-manifest.json').read_text())
        job_id=record['jobId']
        if not triage.re.fullmatch(r'msgbatch_[A-Za-z0-9]+',job_id):raise ValueError('Invalid job ID')
        while True:
            if time.monotonic()-started>a.seconds:
                ledger['runStatus']='paused_time_limit';persist('Preserve pending Anthropic job at time limit');return
            status=json.loads(api('messages/batches/'+job_id,key))
            print(json.dumps({'batch':index,'job':job_id,'status':status.get('processing_status'),'counts':status.get('request_counts')}),flush=True)
            if status.get('processing_status')=='ended':break
            for _ in range(24):time.sleep(5)
        result=dest/f'batch-{index:03}-results.jsonl';result.write_bytes(api('messages/batches/'+job_id+'/results',key))
        summary=triage.summarize(result,manifest);rows=triage.rows(result)
        charge=usage_cost(rows)
        record.update(status='completed',counts=summary['screening'],api=summary['api'],
                      accountedUSD=charge['usd'] if charge else record['reservedUSD'],usage=charge['usage'] if charge else None)
        spent=sum(x.get('accountedUSD',x.get('reservedUSD',0)) for x in ledger['batches'])
        ledger.update(runStatus='in_progress',accountedUSD=spent,
          completedAPIRequests=sum(x['apiRequests'] for x in ledger['batches'] if x['status']=='completed'))
        persist(f'Checkpoint results for photo batch {index}')
        shutil.rmtree(work)
    ledger.update(runStatus='completed',accountedUSD=spent)
    persist('Complete queued visual photo screening; release approvals remain zero')

if __name__=='__main__':main()
