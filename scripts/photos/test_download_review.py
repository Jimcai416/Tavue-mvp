import unittest
from unittest.mock import patch
from download_review import retry_seconds,RateGate

class RateTests(unittest.TestCase):
    def test_always_wait_two_minutes_and_respect_longer_delay(self):
        for value in [None,'','bad','0','30','-10']:
            self.assertEqual(retry_seconds(value),120)
        self.assertEqual(retry_seconds('300'),300)
    def test_retry_after_http_date(self):
        self.assertEqual(retry_seconds('Thu, 01 Jan 1970 00:05:00 GMT',now=0),300)
    def test_pause_never_shortens_existing_shared_cooldown(self):
        with patch('download_review.time.monotonic',return_value=10):
            gate=RateGate();gate.pause(300);gate.pause(120)
            self.assertEqual(gate.until,310)
    def test_wait_yields_in_five_second_steps(self):
        with patch('download_review.time.monotonic',side_effect=[100,100,100,105,105,110]),patch('download_review.time.sleep') as sleep:
            gate=RateGate();gate.until=110;gate.wait()
            self.assertEqual([c.args[0] for c in sleep.call_args_list],[5,5])

if __name__=='__main__':unittest.main()

class FailureBoundTests(unittest.TestCase):
    def check_failure(self,body,expected_calls):
        import gzip,io,json,tempfile,sys
        from pathlib import Path
        import download_review
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory);row={'id':'commons-1','commonsSha1':'hash','previewUrl':'https://upload.wikimedia.org/test.jpg'}
            (p/'catalog.gz').write_bytes(gzip.compress((json.dumps(row)+'\n').encode()))
            (p/'manifest.json').write_text(json.dumps([{'id':'commons-1','sourceSha1':'hash'}]))
            def response(*args,**kwargs):
                r=io.BytesIO(body);r.url=row['previewUrl'];return r
            args=['download_review.py','--catalog',str(p/'catalog.gz'),'--manifest',str(p/'manifest.json'),'--out',str(p/'out')]
            with patch.object(sys,'argv',args),patch('download_review.urllib.request.build_opener') as opener,patch('download_review.RateGate'):
                opener.return_value.open.side_effect=response
                download_review.main()
                self.assertEqual(opener.return_value.open.call_count,expected_calls)
            saved=json.loads((p/'out/downloads.json').read_text())
            self.assertEqual(saved[0]['status'],'download_failed')
    def test_invalid_image_does_not_retry_forever(self):self.check_failure(b'not an image',3)
    def test_oversized_image_is_held_after_one_attempt(self):self.check_failure(b'x'*4_000_001,1)
