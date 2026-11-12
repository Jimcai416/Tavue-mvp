import unittest
from pathlib import Path
import json
import cloud_identity
import triage

class IdentityTests(unittest.TestCase):
    def test_queue_is_unique_and_bounded(self):
        root=Path(__file__).resolve().parents[2]
        refs=json.loads((root/'catalog/cloud-identity-queue.json').read_text())
        self.assertEqual(len(refs),1228)
        self.assertEqual(len({r['id'] for r in refs}),1228)
        self.assertTrue(all(r['sourceSha1'] for r in refs))
    def test_stage_has_separate_state_branch_and_no_release_approval(self):
        self.assertNotEqual(cloud_identity.STATE_BRANCH,'data/cloud-photo-screening-20261111')
        self.assertIn('identity',cloud_identity.STATE_BRANCH)
    def test_unsupported_quote_and_uncertainty_cannot_shortlist(self):
        row={'canonical_name':'borscht','identity_score':5,'source_agreement':True,'evidence_quote':'not in source',
             'visible_support':['red soup'],'uncertainties':[]}
        self.assertEqual(triage.decision(row,'identity',{'title':'Borscht'}),'manual_check')
        row.update(evidence_quote='Borscht',uncertainties=['recipe unclear'])
        self.assertEqual(triage.decision(row,'identity',{'title':'Borscht'}),'manual_check')

if __name__=='__main__':unittest.main()
