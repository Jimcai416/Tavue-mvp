#!/usr/bin/env python3
"""Offline prioritization of existing identity suggestions, never release approvals."""
import argparse,collections,csv,hashlib,json,re
from pathlib import Path

def detail_only(text):
    t=text.strip().lower()
    if re.search(r'\b(or|vs|versus|whether|alternative|contradict|protein|species|filling|cut|brand|origin|regional|variant|variation|type|untrusted|flavor|flavour|colorant)\b|not mentioned|not reference|does not confirm',t):
        return False
    allowed=[r'(?:exact|precise|specific).*\b(?:proportions?|ratios?|quantit(?:y|ies)|measurements?)\b',
      r'(?:exact|precise|specific).*(?:recipe|formulation)(?:\b|$)',
      r'(?:exact|precise|specific).*(?:spice|seasoning|herb).*(?:blend|composition|mix|identif)',
      r'(?:exact|precise|specific).*(?:frosting|icing|dressing|sauce).*(?:composition|ingredients|formulation|recipe)',
      r'(?:recipe proportions|ingredient ratios|precise measurements)',
      r'(?:precise|exact).*(?:ingredient proportions|seasoning|spice blend)']
    return any(re.search(p,t) for p in allowed)

def prioritize(item,evidence,live_consistent):
    m=item.get('model_output') or {};old=item.get('decision')
    result={'id':item['custom_id'],'originalDecision':old,'approved':False,'name':m.get('canonical_name'),
            'uncertainties':m.get('uncertainties',[]),'reason':m.get('reason'),'sourceSha1':evidence.get('commonsSha1'),
            'sourceUrl':evidence.get('sourceUrl'),'evidenceQuote':m.get('evidence_quote')}
    if old=='error':result.update(reviewQueue='model_output_error',holdReason=item.get('error'));return result
    quote=m.get('evidence_quote');visible=m.get('visible_support');unc=m.get('uncertainties')
    supported=isinstance(quote,str) and bool(quote.strip()) and any(quote in str(evidence.get(k,'')) for k in ['title','description'])
    name=m.get('canonical_name');generic=isinstance(name,str) and name.strip().lower() in {'food','dish','pasta','noodles','rice','meat','soup','salad','curry','dessert','sandwich','cake','bread','lunch','dinner'}
    base=(live_consistent and isinstance(name,str) and bool(name.strip()) and not generic and supported
      and m.get('source_agreement') is True and type(m.get('identity_score')) is int and m['identity_score']>=4
      and isinstance(visible,list) and visible and all(isinstance(x,str) and x.strip() for x in visible)
      and isinstance(unc,list) and all(isinstance(x,str) for x in unc)
      and not any(m.get(k) for k in ['aliases','proteins','ingredients','allergens','cuisine']))
    if not base:result.update(reviewQueue='identity_or_evidence_hold',holdReason='Source, exact name, quote, score, visible support or output fields need review');return result
    if not unc:result.update(reviewQueue='original_rule_shortlist',holdReason='Still requires final photograph/source review');return result
    benign=[s for s in unc if detail_only(s)];material=[s for s in unc if not detail_only(s)]
    result.update(detailOnlyCaveats=benign,unresolvedCaveats=material)
    if not material:
        result.update(reviewQueue='recipe_detail_review',holdReason='Only allowlisted recipe-detail caveats detected; assistant/human must confirm before approval')
    else:result.update(reviewQueue='material_or_unclassified_uncertainty',holdReason='Potential identity ambiguity or unclassified caveat; retain for review')
    return result

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--input',required=True);p.add_argument('--out',required=True);a=p.parse_args()
    source=Path(a.input);out=Path(a.out);out.mkdir(parents=True,exist_ok=False)
    rows=[];digests={}
    for f in sorted(source.glob('batch-*-results.summary.json')):
        prefix=f.name.removesuffix('-results.summary.json')
        manifest=json.loads((source/(prefix+'-manifest.json')).read_text())['items']
        checks={r['id']:r['liveMetadataConsistent'] for r in json.loads((source/(prefix+'-source-checks.json')).read_text())}
        digests[f.name]=hashlib.sha256(f.read_bytes()).hexdigest()
        for item in json.loads(f.read_text())['items']:
            cid=item['custom_id'];rows.append(prioritize(item,manifest[cid]['evidence'],checks.get(cid,False)))
    if len({r['id'] for r in rows})!=len(rows):raise ValueError('Duplicate identity IDs')
    stats={'total':len(rows),'queues':dict(collections.Counter(r['reviewQueue'] for r in rows)),
      'newAPICalls':0,'approved':0,'note':'Offline review priority only. Source-supported suggestions and lexical caveat classification do not prove identity, rights, authenticity or safe ingredients.'}
    (out/'review-queues.json').write_text(json.dumps({'summary':stats,'items':rows},ensure_ascii=False,indent=2)+'\n')
    (out/'input-digests.json').write_text(json.dumps(digests,indent=2)+'\n')
    with (out/'review-queues.csv').open('w',newline='',encoding='utf-8-sig') as stream:
        w=csv.DictWriter(stream,fieldnames=['id','name','reviewQueue','originalDecision','sourceSha1','sourceUrl','evidenceQuote','uncertainties','holdReason','approved'],extrasaction='ignore');w.writeheader()
        for r in rows:w.writerow({**r,'uncertainties':' | '.join(r['uncertainties'])})
    print(json.dumps(stats))

if __name__=='__main__':main()
