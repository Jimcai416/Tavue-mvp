import json, os, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import cloud_batch

class CloudBatchTests(unittest.TestCase):
    def test_rejects_unbounded_or_different_model(self):
        with patch('cloud_batch.triage.read_json',return_value={'purpose':'visual-calibration','maxRequests':1000}):
            with self.assertRaises(ValueError):cloud_batch.config()
        with patch('cloud_batch.triage.read_json',return_value={'purpose':'visual-calibration','maxRequests':40,'model':'other'}):
            with self.assertRaises(ValueError):cloud_batch.config()
    def test_rerun_cannot_submit_billable_requests(self):
        with patch('cloud_batch.config',return_value={'maxRequests':40}),patch.dict(os.environ,{'GITHUB_RUN_ATTEMPT':'2'}),patch('cloud_batch.subprocess.run') as run:
            with self.assertRaises(ValueError):cloud_batch.submit()
            run.assert_not_called()
    def test_changed_preparation_config_cannot_submit(self):
        with patch('cloud_batch.config',return_value={'maxRequests':40}),patch.dict(os.environ,{'GITHUB_RUN_ATTEMPT':'1'}),patch('cloud_batch.triage.read_json',return_value={'maxRequests':100}),patch('cloud_batch.subprocess.run') as run:
            with self.assertRaises(ValueError):cloud_batch.submit()
            run.assert_not_called()
    def test_submit_uses_fixed_request_cap(self):
        c={'maxRequests':40}
        with patch('cloud_batch.config',return_value=c),patch.dict(os.environ,{'GITHUB_RUN_ATTEMPT':'1'}),patch('cloud_batch.triage.read_json',return_value=c),patch('cloud_batch.subprocess.run') as run:
            cloud_batch.submit()
            self.assertEqual(run.call_args.args[0][-2:],['--max-requests','40'])

if __name__=='__main__':unittest.main()
