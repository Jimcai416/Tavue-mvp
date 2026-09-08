import tempfile
from pathlib import Path
import unittest
from calibrate import build, source_flags

class CalibrationTests(unittest.TestCase):
    def test_short_own_work_is_not_rejected(self):
        p=dict(author='Me',license='CC0',licenseUrl='https://example.org',sourceUrl='https://commons.wikimedia.org',commonsSha1='abc',title='Bread',description='Own work')
        self.assertEqual(source_flags(p),[])
        del p['author']
        self.assertIn('Missing author',source_flags(p))

    def test_hostile_metadata_is_inert(self):
        p=dict(id='commons-1',commonsSha1='abc',title='</script><script>alert(1)</script>',previewUrl='javascript:alert(1)')
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/'index.html';build([p],out)
            text=out.read_text(encoding='utf-8')
            self.assertNotIn('</script><script>alert(1)',text)
            self.assertNotIn('javascript:alert',text)
            self.assertIn('releaseApproved:false',text)

if __name__=='__main__':unittest.main()
