import unittest
import collections,gzip,json
from pathlib import Path
from reconcile_identity import detail_only,prioritize
class ReconcileTests(unittest.TestCase):
 def test_saved_review_queue_is_readable_and_counts_agree(self):
  root=Path(__file__).resolve().parents[2]/'catalog/review-runs/2026-11-12/identity-reconciliation-v2'
  queue=json.loads(gzip.decompress((root/'review-queues.json.gz').read_bytes()))
  summary=json.loads((root/'summary.json').read_text(encoding='utf-8'))
  self.assertEqual(queue['summary'],summary)
  self.assertEqual(len(queue['items']),summary['total'])
  self.assertEqual(dict(collections.Counter(r['reviewQueue'] for r in queue['items'])),summary['queues'])
  self.assertEqual(len({r['id'] for r in queue['items']}),summary['total'])
  self.assertTrue(all(r['approved'] is False for r in queue['items']))
 def test_ratios_do_not_match_decoration_or_preparation(self):
  self.assertFalse(detail_only('Specific cake flavor hidden by frosting and decoration'))
  self.assertFalse(detail_only('Exact mint parfait preparation method not visually distinguishable'))
  self.assertTrue(detail_only('Exact ingredient ratios cannot be confirmed visually'))
 def test_material_identity_and_source_doubts_stay_held(self):
  for s in ['Exact protein type cannot be confirmed','Specific recipe could be pork or beef','Exact recipe variation unknown','Source metadata untrusted; proportions unknown']:
   self.assertFalse(detail_only(s))
 def test_no_source_agreement_cannot_recover(self):
  m={'canonical_name':'Borscht','evidence_quote':'Borscht','source_agreement':False,'identity_score':5,'visible_support':['beets'],'uncertainties':['Exact ingredient ratios unknown']}
  r=prioritize({'custom_id':'c1','decision':'manual_check','model_output':m},{'title':'Borscht'},True)
  self.assertEqual(r['reviewQueue'],'identity_or_evidence_hold');self.assertFalse(r['approved'])
if __name__=='__main__':unittest.main()
