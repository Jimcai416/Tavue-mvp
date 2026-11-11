#!/usr/bin/env python3
"""Download a frozen review sample with resumable files and a shared rate-limit pause.
No model calls, visual decisions or release approvals are made.
Requires Pillow only to decode previews and produce contact sheets.
"""
import argparse, concurrent.futures, datetime, email.utils, gzip, hashlib, io, json
from pathlib import Path
import threading, time, urllib.error
from PIL import Image, ImageDraw, ImageOps
from triage import validate_url, ImageRedirect
import urllib.request


def retry_seconds(value, now=None):
    minimum=120
    try:return max(minimum,float(value))
    except (TypeError,ValueError):
        try:
            date=email.utils.parsedate_to_datetime(value)
            return max(minimum,date.timestamp()-(time.time() if now is None else now))
        except (TypeError,ValueError,OverflowError):return minimum

class RateGate:
    def __init__(self):self.until=0;self.lock=threading.Lock()
    def pause(self,seconds):
        with self.lock:self.until=max(self.until,time.monotonic()+seconds)
    def wait(self):
        announced=0
        while True:
            with self.lock:left=self.until-time.monotonic()
            if left<=0:return
            if time.monotonic()-announced>=30:
                print(json.dumps({'rateLimitPauseRemaining':round(left)}),flush=True);announced=time.monotonic()
            time.sleep(min(5,left))

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--catalog',default='catalog/candidates.jsonl.gz')
    p.add_argument('--manifest',required=True)
    p.add_argument('--limit',type=int,default=100)
    p.add_argument('--out',required=True)
    p.add_argument('--retries',type=int,default=0,help='0 retries indefinitely; progress is checkpointed')
    a=p.parse_args()
    if not 1<=a.limit<=1000 or a.retries<0:p.error('limit 1–1000 and retries >= 0')
    rows={r['id']:r for r in (json.loads(l) for l in gzip.open(a.catalog,'rt',encoding='utf-8'))}
    refs=json.loads(Path(a.manifest).read_text())[:a.limit]
    sample=[]
    for r in refs:
        item=rows[r['id']]
        if item['commonsSha1']!=r['sourceSha1']:raise ValueError('Source snapshot mismatch')
        sample.append(item)
    out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    def write(name,obj):
        path=out/name;temp=path.with_suffix(path.suffix+'.tmp')
        temp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');temp.replace(path)
    if (out/'sample.json').exists() and json.loads((out/'sample.json').read_text())!=sample:
        raise ValueError('Output already belongs to a different sample')
    write('sample.json',sample)
    gate=RateGate();progress={};lock=threading.Lock()
    def download(pair):
        n,r=pair;dest=out/f'{n:03}.jpg';error=None
        attempt=0
        while a.retries == 0 or attempt < a.retries:
            attempt += 1
            try:
                if not dest.exists():
                    gate.wait()
                    url=r['previewUrl'];validate_url(url,('upload.wikimedia.org','thumb.wikimedia.org'))
                    req=urllib.request.Request(url,headers={'User-Agent':'TavuePhotoReview/1.0 (https://github.com/Jimcai416/Tavue-mvp)'})
                    with urllib.request.build_opener(ImageRedirect()).open(req,timeout=30) as response:
                        validate_url(response.url,('upload.wikimedia.org','thumb.wikimedia.org'));data=response.read(4000001)
                    if not data or len(data)>4000000:raise ValueError('Preview empty or exceeds 4 MB')
                    im=ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert('RGB');im.thumbnail((960,960))
                    tmp=dest.with_suffix('.tmp');im.save(tmp,format='JPEG',quality=90);tmp.replace(dest)
                # Decode cached files as well; an interrupted file never counts as success.
                with Image.open(dest) as im:im.verify()
                result={'number':n,'id':r['id'],'sourceSha1':r['commonsSha1'],'status':'downloaded',
                        'path':str(dest),'previewSha256':hashlib.sha256(dest.read_bytes()).hexdigest()}
                break
            except urllib.error.HTTPError as exc:
                error=str(exc)
                if exc.code==429:
                    delay=retry_seconds(exc.headers.get('Retry-After'));gate.pause(delay)
                    print(json.dumps({'id':r['id'],'http':429,'waitingAtLeastSeconds':delay,'attempt':attempt}),flush=True)
                elif exc.code in (500,502,503,504):gate.pause(10)
                else:break
            except (OSError,ValueError) as exc:
                error=str(exc)
                if dest.exists():dest.unlink()
                gate.pause(5)
        else:result=None
        if error and 'result' not in locals():result=None
        if result is None:result={'number':n,'id':r['id'],'sourceSha1':r['commonsSha1'],'status':'download_failed','error':error}
        with lock:
            progress[n]=result;write('downloads.json',[progress[k] for k in sorted(progress)])
            if len(progress)%10==0:print(json.dumps({'attempted':len(progress),'total':len(sample)}),flush=True)
        return result
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        results=list(pool.map(download,enumerate(sample,1)))
    for start in range(0,len(sample),20):
        sheet=Image.new('RGB',(1280,1450),'#f7f3ee');d=ImageDraw.Draw(sheet)
        for j,r in enumerate(results[start:start+20]):
            x=j%4*320;y=j//4*290
            if r['status']=='downloaded':
                im=Image.open(r['path']);im.thumbnail((312,258));sheet.paste(im,(x+(320-im.width)//2,y+(258-im.height)//2))
            else:d.text((x+10,y+100),'DOWNLOAD FAILED',fill='red')
            d.text((x+8,y+263),f"{r['number']:03} {r['id']}",fill='black')
        sheet.save(out/f'sheet-{start//20+1}.jpg',quality=95)
    print(json.dumps({'downloaded':sum(r['status']=='downloaded' for r in results),'failed':sum(r['status']!='downloaded' for r in results),'visuallyReviewed':0}),flush=True)

if __name__=='__main__':main()
