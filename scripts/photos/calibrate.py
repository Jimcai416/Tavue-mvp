#!/usr/bin/env python3
"""Build a balanced, local calibration sheet. Labels are NOT release approvals."""
import argparse
import hashlib
import html
import json
from pathlib import Path
import sqlite3
from urllib.parse import urlparse


def source_flags(item):
    flags = []
    for key in ('author', 'license', 'licenseUrl', 'sourceUrl', 'commonsSha1'):
        if not item.get(key):
            flags.append('Missing ' + key)
    if not item.get('title') and not item.get('description'):
        flags.append('No identity evidence')
    # Short text and "Own work" alone are never rejection criteria.
    return flags


def safe_url(value):
    value = str(value or '')
    return value if urlparse(value).scheme == 'https' else ''


def sample(db, limit, offset):
    connection = sqlite3.connect(Path(db).resolve().as_uri() + '?mode=ro', uri=True)
    try:
        return [json.loads(r[0]) for r in connection.execute('''WITH ranked AS (
          SELECT record, category, pageid,
          row_number() OVER (PARTITION BY category ORDER BY pageid) AS position
          FROM files WHERE status='pending_review'
        ) SELECT record FROM ranked ORDER BY position,category,pageid LIMIT ? OFFSET ?''', (limit, offset))]
    finally:
        connection.close()


PAGE = r'''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Tavue 图片校准</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f7f3ee;color:#302722;font:15px system-ui}header{padding:22px 4%;background:#f7f3ee;position:sticky;top:0;z-index:2;border-bottom:1px solid #dbcfc5}h1{font-size:24px;margin:0 0 8px}p{line-height:1.6}button,select{font:inherit;padding:9px 12px;border:1px solid #d4c5b9;border-radius:8px;background:white;cursor:pointer}button.active{background:#a44f38;color:white}main{padding:24px 4%;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:22px}article{background:white;border-radius:16px;overflow:hidden;border:1px solid #e5dcd3}img{width:100%;height:270px;object-fit:contain;background:#eee8e1;cursor:zoom-in}.body{padding:16px}h2{font-size:16px;overflow-wrap:anywhere}small{color:#75665c}.actions{display:flex;flex-wrap:wrap;gap:6px}textarea{width:100%;margin-top:12px;padding:10px;min-height:60px;border:1px solid #ddd;border-radius:8px}details{margin:12px 0;overflow-wrap:anywhere}a{color:#97472e}.flag{color:#964120}dialog{width:95vw;max-width:1200px;border:0;padding:12px;background:#f7f3ee}dialog img{height:80vh}#status{margin:8px 0}.hidden{display:none}
</style><header><h1>Tavue · 选出真正想展示的图片</h1>
<p>先看原图，再展开来源。可展示只表示视觉正例，不代表菜名、真实性或授权已核实。包装印刷图不算实物；裁切候选需看实际裁切后再判断。</p>
<select id="filter"><option value="all">全部</option><option value="pending">未选择</option><option value="display">可展示</option><option value="crop">需裁切</option><option value="reject">淘汰</option><option value="verify">待核实</option></select>
<button id="export">导出选择</button> <label>恢复选择 <input id="import" type="file" accept=".json"></label>
<div id="status"></div><small>选择会尽力保存在当前浏览器；完成后请导出。图片加载会访问 Wikimedia，失败可点来源页查看。原图可点击放大。</small></header>
<main>__CARDS__</main><dialog id="zoom"><button id="close">关闭</button><img alt="原图预览"></dialog>
<script>
const items=__DATA__, batch=__BATCH__, key='tavue-calibration-'+batch;
let answers={};const valid=new Set(['display','crop','reject','verify']);
try{answers=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){}
if(!answers||typeof answers!=='object'||Array.isArray(answers))answers={};
let storageWarning='';
function persist(){try{localStorage.setItem(key,JSON.stringify(answers))}catch(e){storageWarning=' 浏览器无法保存，请导出选择。'}}
function redraw(){let n=0;document.querySelectorAll('article').forEach(card=>{
const a=answers[card.dataset.id], decision=a?.decision||'pending';if(a)n++;
card.classList.toggle('hidden',filter.value!=='all'&&filter.value!==decision);
card.querySelectorAll('[data-choice]').forEach(b=>b.classList.toggle('active',b.dataset.choice===decision));
});document.querySelector('#status').textContent=`已选择 ${n} / ${items.length} 张。`+storageWarning;}
const filter=document.querySelector('#filter');filter.onchange=redraw;
for(const card of document.querySelectorAll('article')){
const item=items.find(x=>x.id===card.dataset.id), note=card.querySelector('textarea');note.value=answers[item.id]?.note||'';
card.querySelectorAll('[data-choice]').forEach(button=>button.onclick=()=>{answers[item.id]={id:item.id,sourceSha1:item.commonsSha1,decision:button.dataset.choice,note:note.value,updatedAt:new Date().toISOString()};persist();redraw()});
note.onchange=()=>{if(answers[item.id]){answers[item.id].note=note.value;persist()}};
card.querySelector('img').onclick=()=>{document.querySelector('#zoom img').src=item.previewUrl;document.querySelector('#zoom').showModal()};
card.querySelector('img').onerror=()=>{card.querySelector('.image-status').textContent='图片加载失败：请打开来源页核对。'};
}
document.querySelector('#close').onclick=()=>document.querySelector('#zoom').close();
document.querySelector('#export').onclick=()=>{const blob=new Blob([JSON.stringify({schema:'tavue-calibration-v1',batch,releaseApproved:false,labels:Object.values(answers)},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='tavue-calibration-'+batch+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
document.querySelector('#import').onchange=async event=>{try{const data=JSON.parse(await event.target.files[0].text());if(data.batch!==batch||data.schema!=='tavue-calibration-v1'||!Array.isArray(data.labels))throw Error('批次不匹配');const next={};for(const a of data.labels){const item=items.find(x=>x.id===a.id);if(!item||item.commonsSha1!==a.sourceSha1||!valid.has(a.decision)||typeof a.note!=='string')throw Error('记录不匹配');next[a.id]=a;}answers=next;persist();document.querySelectorAll('article').forEach(c=>c.querySelector('textarea').value=answers[c.dataset.id]?.note||'');redraw()}catch(e){alert('无法导入：'+e.message)}};
redraw();
</script></html>'''


def build(items, out):
    cards=[]
    normalized=[]
    for item in items:
        item=dict(item)
        for key in ('previewUrl','sourceUrl','licenseUrl'):
            item[key]=safe_url(item.get(key))
        normalized.append(item)
        esc=lambda key:html.escape(str(item.get(key,'')),quote=True)
        flags=source_flags(item)
        buttons=''.join('<button data-choice="'+v+'">'+label+'</button>' for v,label in [('display','可展示'),('crop','需裁切'),('reject','淘汰'),('verify','待核实')])
        cards.append(f'''<article data-id="{esc('id')}"><img loading="lazy" src="{esc('previewUrl')}" alt="候选原图"><div class="body"><small>{esc('id')} · {esc('discoveryCategory')}</small><p class="image-status"></p><div class="actions">{buttons}</div><textarea placeholder="理由：光线、构图、印刷图、身份疑点…"></textarea><details><summary>查看来源与菜名线索</summary><h2>{esc('title')}</h2><p>{esc('description')}</p><p>作者：{esc('author')} · {esc('license')}</p><a href="{esc('sourceUrl')}" target="_blank" rel="noopener noreferrer">打开来源页</a> · <a href="{esc('licenseUrl')}" target="_blank" rel="noopener noreferrer">许可</a><p class="flag">{html.escape('；'.join(flags) if flags else '基本字段齐全，身份与授权仍需核实')}</p></details></div></article>''')
    batch=hashlib.sha256(json.dumps([(x['id'],x.get('commonsSha1')) for x in normalized]).encode()).hexdigest()[:16]
    data=json.dumps(normalized,ensure_ascii=False).replace('<','\\u003c')
    result=PAGE.replace('__CARDS__',''.join(cards)).replace('__DATA__',data).replace('__BATCH__',json.dumps(batch))
    out=Path(out);out.parent.mkdir(parents=True,exist_ok=True)
    out.write_text(result,encoding='utf-8')
    out.with_suffix('.sample.json').write_text(json.dumps({'batch':batch,'items':normalized},ensure_ascii=False,indent=2),encoding='utf-8')
    return batch


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--db',default='catalog/work/candidates.sqlite')
    p.add_argument('--limit',type=int,default=100)
    p.add_argument('--offset',type=int,default=0)
    p.add_argument('--out',default='catalog/work/calibration/index.html')
    a=p.parse_args()
    if not 1<=a.limit<=500 or a.offset<0:p.error('limit 1–500; offset nonnegative')
    items=sample(a.db,a.limit,a.offset)
    batch=build(items,a.out)
    print(json.dumps({'candidates':len(items),'categories':len({x.get('discoveryCategory') for x in items}),'source_flags':sum(bool(source_flags(x)) for x in items),'batch':batch,'path':a.out,'approved':0}))

if __name__=='__main__':main()
