#!/usr/bin/env python3
"""Build paginated candidate review pages; downloads decisions, never publishes."""
import argparse,gzip,html,json,sqlite3
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--db',default='catalog/work/candidates.sqlite');p.add_argument('--out',default='catalog/work/review');p.add_argument('--page-size',type=int,default=40);a=p.parse_args()
c=sqlite3.connect(a.db);rows=[json.loads(x[0]) for x in c.execute("SELECT record FROM files WHERE status='pending_review' ORDER BY pageid")];out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
script=r'''
const key='tavue-photo-review-v1';let answers=JSON.parse(localStorage.getItem(key)||'{}');
function save(card, verdict){
 const item=items.find(x=>x.id===card.dataset.id);const name=card.querySelector('[name=name]').value.trim();
 const checked=[...card.querySelectorAll('input[type=checkbox]')].every(e=>e.checked);
 const reviewer=document.querySelector('#reviewer').value.trim();
 if(!reviewer || (verdict==='approved' && (!name || !checked))) {alert('Enter reviewer name, exact dish name and complete all four checks.');return;}
 answers[item.id]={id:item.id,sourceSha1:item.commonsSha1,verdict,reviewedBy:reviewer,reviewedAt:new Date().toISOString(),name,aliases:card.querySelector('[name=aliases]').value.split('|').map(x=>x.trim()).filter(Boolean),proteins:card.querySelector('[name=proteins]').value.split(',').map(x=>x.trim()).filter(Boolean),cuisine:card.querySelector('[name=cuisine]').value.trim(),checks:{identity:checked,quality:checked,provenance:checked,photograph:checked}};
 localStorage.setItem(key,JSON.stringify(answers));card.querySelector('output').textContent=verdict;
}
for(const card of document.querySelectorAll('article')){card.querySelector('output').textContent=answers[card.dataset.id]?.verdict||'pending_review';card.querySelector('[data-approve]').onclick=()=>save(card,'approved');card.querySelector('[data-reject]').onclick=()=>save(card,'rejected');}
document.querySelector('#export').onclick=()=>{const blob=new Blob([JSON.stringify(Object.values(answers),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='photo-decisions.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
'''
links=[]
for start in range(0,len(rows),a.page_size):
 subset=rows[start:start+a.page_size];page=start//a.page_size+1;cards=[]
 for item in subset:
  e={k:html.escape(str(v),quote=True) for k,v in item.items()}
  cards.append(f'''<article data-id="{e['id']}"><img loading="lazy" src="{e['previewUrl']}" alt="Candidate {e['title']}"><h2>{e['title']}</h2><p>{e['description']}</p><p>{e['discoveryCategory']}</p><p>{e['author']} · <a href="{e['licenseUrl']}">{e['license']}</a> · <a target="_blank" rel="noopener" href="{e['sourceUrl']}">Verify source</a></p><label>Exact dish <input name="name" placeholder="Do not use the category as a recipe name"></label><label>Aliases, separated by | <input name="aliases"></label><label>Cuisine <input name="cuisine"></label><label>Meat/seafood shown (chicken,beef,pork,duck,lamb,seafood) <input name="proteins"></label><label><input type="checkbox">Exact recipe and variant verified</label><label><input type="checkbox">Clear, appetising, useful crop</label><label><input type="checkbox">Author, licence and source verified</label><label><input type="checkbox">Photograph; no watermark, illustration or suspected generation</label><button data-approve>Approve</button> <button data-reject>Reject</button> <output></output></article>''')
  # The page does not infer approval from API success or a default checkbox.
 nav=f'<a href="index.html">Index</a> · Page {page}'
 if start+a.page_size<len(rows):nav+=f' · <a href="page-{page+1}.html">Next</a>'
 data=json.dumps(subset,ensure_ascii=False).replace('<','\\u003c')
 content='''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tavue candidate review</title><style>body{font:15px system-ui;background:#f7f3ee;color:#29221e;margin:24px}header{position:sticky;top:0;background:#f7f3ee;padding:12px;z-index:2}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:24px}article{background:white;border:1px solid #ddd;border-radius:14px;padding:18px}img{width:100%;height:280px;object-fit:contain}p{font-size:12px;overflow-wrap:anywhere}label{display:block;margin:10px 0}input:not([type=checkbox]){display:block;width:95%;padding:8px}button{padding:10px}output{font-weight:bold}</style><header>'''+nav+' · Reviewer <input id="reviewer"><button id="export">Export decisions from this browser</button><p>Candidate photos, not approved inventory. Export your decisions before closing. Image downloads contact Wikimedia.</p></header><main>'+''.join(cards)+'</main><script>const items='+data+';'+script+'</script>'
  # source metadata is JSON-escaped and HTML-escaped; never execute source text.
 (out/f'page-{page}.html').write_text(content);links.append(f'<li><a href="page-{page}.html">Page {page} ({len(subset)} candidates)</a></li>')
(out/'index.html').write_text('<!doctype html><meta charset="utf-8"><h1>Tavue photo review queue</h1><p>'+str(len(rows))+' metadata-eligible candidates. No approval implied.</p><ul>'+''.join(links)+'</ul>')
print(json.dumps({'candidates':len(rows),'pages':len(links),'path':str(out/'index.html')}))
