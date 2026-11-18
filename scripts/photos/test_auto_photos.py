import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import subprocess
import auto_photos as a

class AutomaticReviewTests(unittest.TestCase):
 def source(self):return {'title':'File:Chicken adobo.jpg','description':'Chicken adobo served with rice.','requiredCredit':''}
 def verdict(self):return {'verdict':'accept','canonical_name':'Chicken adobo','evidence_quote':'Chicken adobo','checks':dict.fromkeys(['identity','quality','photograph','phone','variant_preserved'],True),'scores':dict.fromkeys(['sharpness','lighting','composition','appeal'],4),'visible_support':['Finished chicken pieces in sauce beside rice.'],'phone_observations':['Chicken and rice remain legible in the actual thumbnail.'],'protein_evidence':{'chicken':'Chicken adobo'},'uncertainties':[],'reason':'Source and both photographs agree.'}
 def test_complete_supported_model_judgement_passes(self):self.assertTrue(a.evaluate(self.verdict(),self.source())[0])
 def test_complete_original_filename_is_valid_source_quote(self):
  v=self.verdict();v['evidence_quote']='File:Chicken adobo.jpg'
  self.assertTrue(a.evaluate(v,self.source())[0])
 def test_checkpoint_retries_do_not_repeat_paid_post(self):
  rejected=subprocess.CompletedProcess([],1,stdout='',stderr='! [remote rejected] HEAD -> branch (failed)')
  accepted=subprocess.CompletedProcess([],0,stdout='',stderr='')
  with patch.object(a.subprocess,'run',side_effect=[rejected,accepted]) as git,patch.object(a.triage,'request') as paid:
   sleeps=[];a.push_checkpoint(Path('.'),'branch',sleep=sleeps.append)
   self.assertEqual(git.call_count,2);self.assertEqual(sleeps,[5]);paid.assert_not_called()
 def test_checkpoint_push_retries_even_when_remote_already_has_commit(self):
  with patch.object(a.subprocess,'run',return_value=subprocess.CompletedProcess([],0,stdout='',stderr='Everything up-to-date')) as git:
   a.push_checkpoint(Path('.'),'branch');git.assert_called_once()
 def test_checkpoint_retry_exhaustion_preserves_results_and_stops_new_calls(self):
  with patch.object(a.subprocess,'run',return_value=subprocess.CompletedProcess([],1,stdout='',stderr='remote rejected')) as git,patch.object(a.triage,'request') as paid:
   with self.assertRaisesRegex(RuntimeError,'retained'):a.push_checkpoint(Path('.'),'branch',attempts=3,sleep=lambda n:None)
   self.assertEqual(git.call_count,3);paid.assert_not_called()
 def test_branch_conflict_is_not_force_pushed(self):
  with patch.object(a.subprocess,'run',return_value=subprocess.CompletedProcess([],1,stdout='',stderr='non-fast-forward')) as git:
   with self.assertRaises(RuntimeError):a.push_checkpoint(Path('.'),'branch',sleep=lambda n:None)
   git.assert_called_once();self.assertNotIn('--force',git.call_args.args[0])
 def test_score_alone_and_phone_crop_cannot_approve(self):
  for field in ['phone','identity','photograph','variant_preserved']:
   v=self.verdict();v['checks'][field]=False;self.assertFalse(a.evaluate(v,self.source())[0])
  for value in [3,True,'5']:
   v=self.verdict();v['scores']['sharpness']=value;self.assertFalse(a.evaluate(v,self.source())[0])
 def test_hallucinated_name_quote_protein_and_uncertainty_stay_held(self):
  changes=[{'canonical_name':'Beef adobo'},{'evidence_quote':'A nonexistent quote'},{'protein_evidence':{'beef':'Chicken adobo'}},{'protein_evidence':{}},{'uncertainties':['May be a painting']},{'canonical_name':'Cake'},{'phone_observations':[]}]
  for change in changes:
   v=self.verdict();v.update(change);self.assertFalse(a.evaluate(v,self.source())[0],change)
 def test_mutton_and_plant_name_cannot_become_lamb(self):
  for name in ['Mutton stew',"Lamb's lettuce salad"]:
   s=self.source();s.update(title='File:'+name+'.jpg',description=name)
   v=self.verdict();v.update(canonical_name=name,evidence_quote=name,protein_evidence={'lamb':name})
   self.assertFalse(a.evaluate(v,s)[0])
 def test_special_credit_requests_are_not_ignored(self):
  s=self.source();s['description']+=' Please credit and link to https://example.com/'
  self.assertFalse(a.evaluate(self.verdict(),s)[0])
 def test_author_link_is_extracted_from_real_metadata_only(self):
  self.assertEqual(a.credit_url({'Artist':{'value':'<a href="https://www.mikepeel.net/">Mike Peel</a>'}}),'https://www.mikepeel.net/')
  for link in ['javascript:alert(1)','https://secret@example.com','https://commons.wikimedia.org/wiki/User:X']:
   self.assertIsNone(a.credit_url({'Artist':{'value':'<a href="'+link+'">X</a>'}}))
 def test_truncated_provider_output_is_not_accepted(self):
  with self.assertRaises(ValueError):a.parse_message({'stop_reason':'max_tokens','content':[]})
 def pipeline(self,temp,budget=1):
  config={'requestId':'test','budgetUSD':budget,'concurrency':2,'maxQueries':2,'resultsPerQuery':2,'maxCandidates':4,'seconds':60}
  with patch.object(a,'ROOT',Path(temp)),patch.object(a.triage,'api_key',return_value='test-key'):
   return a.Pipeline(config)
 def test_budget_reservation_and_duplicate_paid_request_blocked(self):
  with tempfile.TemporaryDirectory() as t:
   p=self.pipeline(t,budget=.01);body={'model':'m','system':'s','messages':[],'max_tokens':1100}
   with patch.object(p,'api',return_value={'input_tokens':1000}):
    self.assertTrue(p.reserve('one',body));self.assertFalse(p.reserve('one',body));self.assertFalse(p.reserve('two',body))
   self.assertAlmostEqual(a.expense(1000,1000),.006)
 def test_paid_timeout_is_not_retried(self):
  with tempfile.TemporaryDirectory() as t:
   p=self.pipeline(t)
   with patch.object(a.triage,'request',side_effect=TimeoutError) as request:
    k,m,e=p.paid('x',{});self.assertEqual(e,'TimeoutError');request.assert_called_once()
 def test_provider_response_and_usage_recorded_honestly(self):
  with tempfile.TemporaryDirectory() as t:
   p=self.pipeline(t);p.ledger['requests']['x']={'status':'reserved','reservedUSD':.1}
   p.settle('x',{'id':'msg_test','usage':{'input_tokens':1000,'output_tokens':200}},None)
   self.assertEqual(p.ledger['requests']['x']['status'],'completed');self.assertAlmostEqual(p.ledger['requests']['x']['actualUSD'],.002)
   self.assertTrue((p.out/'x-response.json').exists())
 def test_uncertain_old_request_remains_reserved_and_is_not_resubmitted(self):
  with tempfile.TemporaryDirectory() as t:
   p=self.pipeline(t);p.records=[{'id':'c1','commonsSha1':'sha'}]
   p.ledger['requests']['c1']={'status':'reserved','reservedUSD':.008}
   with patch.object(p,'paid') as paid:p.recover_saved_reviews()
   self.assertEqual(p.ledger['requests']['c1']['status'],'ambiguous')
   self.assertEqual(p.ledger['requests']['c1']['reservedUSD'],.008)
   self.assertEqual(p.decisions[0]['reason'],'provider_result_missing_after_interruption');paid.assert_not_called()
 def test_resume_reuses_saved_response_and_actual_usage(self):
  with tempfile.TemporaryDirectory() as t:
   p=self.pipeline(t);s=self.source();s.update(id='c1',commonsSha1='sha');p.records=[s]
   p.ledger['requests']['c1']={'status':'reserved','reservedUSD':.008}
   v=self.verdict();v['verdict']='hold'
   message={'id':'msg_saved','stop_reason':'end_turn','content':[{'type':'text','text':json.dumps(v)}],'usage':{'input_tokens':1000,'output_tokens':200}}
   a.triage.write_json(p.out/'c1-response.json',message)
   with patch.object(p,'paid') as paid:p.recover_saved_reviews()
   self.assertEqual(p.ledger['requests']['c1']['status'],'completed')
   self.assertAlmostEqual(p.ledger['requests']['c1']['actualUSD'],.002)
   self.assertEqual(len(p.decisions),1);paid.assert_not_called()
 def test_original_source_change_prevents_intake(self):
  with tempfile.TemporaryDirectory() as t:
   p=self.pipeline(t);r={'id':'c1','commonsSha1':'sha'};d={}
   with patch.object(a,'catalogue',return_value=([],[])),patch.object(p,'current_source',return_value={'c1':{'consistent':False}}):p.integrate([(r,self.verdict(),d)])
   self.assertEqual(d['verdict'],'held');self.assertEqual(d['reason'],'source_metadata_changed')
 def test_unavailable_preview_wave_does_not_skip_later_candidates(self):
  with tempfile.TemporaryDirectory() as t:
   p=self.pipeline(t);p.records=[{'id':'c1','commonsSha1':'sha1'},{'id':'c2','commonsSha1':'sha2'}]
   with patch.object(a,'WAVE_SIZE',1),patch.object(p,'prepare',side_effect=lambda r:(r,{},'HTTPError')),patch.object(p,'persist'),patch.object(p,'paid') as paid:
    p.review()
   self.assertEqual([d['id'] for d in p.decisions],['c1','c2'])
   self.assertEqual(p.ledger['status'],'completed');paid.assert_not_called()
 def test_last_source_retry_still_preserves_shared_cooldown(self):
  import urllib.error
  with tempfile.TemporaryDirectory() as t:
   p=self.pipeline(t);r={'id':'c1','previewUrl':'https://upload.wikimedia.org/test.jpg'}
   error=urllib.error.HTTPError(r['previewUrl'],429,'Rate limited',{'Retry-After':'30'},None)
   with patch.object(a.triage,'source_flags',return_value=[]),patch.object(a.triage,'image_source',side_effect=error) as fetch,patch.object(a,'DOWNLOAD_GATE') as gate:
    result=p.prepare(r)
   self.assertEqual(result[2],'HTTPError');self.assertEqual(fetch.call_count,3)
   self.assertEqual([c.args[0] for c in gate.pause.call_args_list],[120,120,120])
 def test_completed_planner_response_is_recovered_without_paying_again(self):
  with tempfile.TemporaryDirectory() as t:
   p=self.pipeline(t);p.paid_lock=True
   message={'stop_reason':'end_turn','content':[{'type':'text','text':json.dumps({'queries':[{'dish':'Chicken adobo','query':'Chicken adobo','cuisine':'Filipino'}]})}]}
   a.triage.write_json(p.out/'planner-response.json',message)
   with patch.object(p,'persist'),patch.object(p,'paid') as paid:queries=p.plan()
   self.assertEqual(len(queries),1);paid.assert_not_called()
 def test_saved_passing_review_recovers_intake_without_repeating_inference(self):
  with tempfile.TemporaryDirectory() as t:
   p=self.pipeline(t);r={'id':'c1'};p.records=[r];(p.work/'c1.jpg').write_bytes(b'unchanged')
   d={'id':'c1','verdict':'held','reason':'claude_full_and_phone_review_passed','previewSha256':a.digest(b'unchanged'),'modelOutput':self.verdict()};p.decisions=[d]
   with patch.object(p,'prepare',return_value=(r,{},None)),patch.object(a,'evaluate',return_value=(True,'ok')),patch.object(p,'integrate') as intake,patch.object(p,'persist'),patch.object(p,'paid') as paid:
    p.recover_intake();self.assertEqual(len(intake.call_args.args[0]),1);paid.assert_not_called()
 def test_regression_failure_rolls_back_only_new_intake_files(self):
  with tempfile.TemporaryDirectory() as t:
   p=self.pipeline(t);root=Path(t);(root/'shared').mkdir();(root/'src/lib').mkdir(parents=True);(root/'assets/dishes').mkdir(parents=True)
   (root/'shared/reviewedDishPhotos.ts').write_text('export const reviewedDishPhotos = [];\n')
   (root/'src/lib/dishPhotoAssets.ts').write_text('export const dishPhotoAssets = {\n};')
   (root/'assets/dishes/CREDITS.md').write_text('Existing credits\n')
   paths=[root/'shared/reviewedDishPhotos.ts',root/'src/lib/dishPhotoAssets.ts',root/'assets/dishes/CREDITS.md'];before={f:f.read_bytes() for f in paths}
   (root/'assets/dishes/prior.jpg').write_bytes(b'prior unrelated photo')
   a.Image.new('RGB',(200,160),'red').save(p.work/'c1.jpg')
   r={k:'x' for k in a.PHOTO_FIELDS};r.update(id='c1',commonsSha1='sha');d={}
   with patch.object(a,'ROOT',root),patch.object(a,'catalogue',return_value=([],[])),patch.object(p,'current_source',return_value={'c1':{'consistent':True}}),patch.object(a.subprocess,'run',side_effect=subprocess.CalledProcessError(1,'node')):
    p.integrate([(r,self.verdict(),d)])
   self.assertEqual(d['reason'],'catalogue_regression_check_failed')
   self.assertEqual(p.ledger['newApproved'],0)
   self.assertTrue(all(f.read_bytes()==before[f] for f in paths))
   self.assertEqual((root/'assets/dishes/prior.jpg').read_bytes(),b'prior unrelated photo')
   self.assertFalse((root/'assets/dishes/reviewed-c1.jpg').exists())

if __name__=='__main__':unittest.main()
