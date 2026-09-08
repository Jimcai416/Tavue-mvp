import copy,importlib.util,json,sqlite3,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from collect import candidate
from check_release import check
from prepare_release import load_records,normalize
class PipelineTests(unittest.TestCase):
 def fixture(self):
  val=lambda x:{'value':x}
  return {'pageid':42,'title':'File:Carbonara.jpg','imageinfo':[{'mime':'image/jpeg','width':1600,'height':1200,'url':'https://upload.wikimedia.org/wikipedia/commons/x/a.jpg','thumburl':'https://thumb.wikimedia.org/wikipedia/commons/thumb/x/a.jpg/960px-a.jpg','descriptionurl':'https://commons.wikimedia.org/wiki/File:Carbonara.jpg','sha1':'abc','extmetadata':{'LicenseShortName':val('CC BY-SA 4.0'),'Artist':val('Photographer'),'LicenseUrl':val('https://creativecommons.org/licenses/by-sa/4.0/'),'ImageDescription':val('Spaghetti carbonara')}}]}
 def test_candidate_never_autoapproved(self):
  p,reason=candidate(self.fixture(),'Category:Pasta dishes');self.assertIsNone(reason);self.assertFalse(p['approved']);self.assertEqual(p['status'],'pending_review')
 def test_licence_and_quality_filters(self):
  x=self.fixture();x['imageinfo'][0]['extmetadata']['LicenseShortName']['value']='CC BY-NC 4.0';self.assertEqual(candidate(x,'Pasta')[1],'licence_not_allowlisted')
  x=self.fixture();x['imageinfo'][0]['width']=200;self.assertEqual(candidate(x,'Pasta')[1],'resolution_below_600')
  x=self.fixture();x['imageinfo'][0]['thumburl']='https://unreviewed.invalid/a.jpg';self.assertEqual(candidate(x,'Pasta')[1],'unexpected_asset_host')
 def test_pilot_cannot_pass_launch(self):
  with tempfile.TemporaryDirectory() as folder:
   p=Path(folder);(p/'release.json').write_text(json.dumps({'launchReady':False}));(p/'manifest.json').write_text('[]')
   with self.assertRaisesRegex(ValueError,'10,000'):check(folder)
 def test_identity_normalization(self):
  self.assertEqual(normalize(' Bánh mì '),'banh mi');self.assertEqual(normalize("Shepherd’s Pie"),'shepherds pie');self.assertEqual(normalize('麻婆豆腐'),'麻婆豆腐')
if __name__=='__main__':unittest.main()
