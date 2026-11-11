import unittest
from unittest.mock import patch,Mock
from urllib.error import HTTPError
import cloud_bulk

class BulkTests(unittest.TestCase):
    def ledger(self):return {'requestKey':'frozen','batchSize':200,'budgetUSD':15,'batches':[]}
    def test_paid_reservation_and_ambiguous_locks_block_resubmission(self):
        for status in ['reserved','ambiguous_submission']:
            ledger=self.ledger();ledger['batches']=[{'status':status}]
            with self.assertRaises(ValueError):cloud_bulk.check_ledger(ledger,200,15,'frozen')
    def test_existing_receipt_can_be_collected(self):
        ledger=self.ledger();ledger['batches']=[{'status':'submitted','jobId':'msgbatch_test'}]
        cloud_bulk.check_ledger(ledger,200,15,'frozen')
    def test_resume_cannot_change_budget_or_queue(self):
        with self.assertRaises(ValueError):cloud_bulk.check_ledger(self.ledger(),200,20,'frozen')
        with self.assertRaises(ValueError):cloud_bulk.check_ledger(self.ledger(),200,15,'different')
    def test_price_and_uncertain_billing_reservation(self):
        self.assertAlmostEqual(cloud_bulk.cost(56086,11727),.0573605)
        self.assertIsNone(cloud_bulk.usage_cost([{'result':{'type':'errored'}}]))
        self.assertIsNone(cloud_bulk.usage_cost([{'result':{'type':'succeeded','message':{'usage':{'input_tokens':100}}}}]))
    def test_ambiguous_paid_post_not_retried(self):
        with patch('cloud_bulk.GATE'),patch('cloud_bulk.triage.request',side_effect=TimeoutError) as request:
            with self.assertRaises(TimeoutError):cloud_bulk.api('messages/batches','test',{})
            request.assert_called_once()
    def test_explicit_rate_limit_waits_before_retry(self):
        error=HTTPError('https://api.anthropic.com',429,'rate limit',{'Retry-After':'300'},None)
        with patch('cloud_bulk.GATE') as gate,patch('cloud_bulk.triage.request',side_effect=[error,b'{}']) as request:
            self.assertEqual(cloud_bulk.api('messages/batches','test',{}),b'{}')
            gate.pause.assert_called_once_with(300);self.assertEqual(request.call_count,2)
    def test_token_reservation_includes_all_output_and_input_padding(self):
        entry={'params':{'model':'m','system':'s','messages':[]}}
        with patch('cloud_bulk.api',return_value=b'{"input_tokens": 1000}'):
            n,reserve=cloud_bulk.reserve_cost([entry,entry],'test')
        self.assertEqual(n,2000)
        self.assertAlmostEqual(reserve,cloud_bulk.cost(2400,2400))

if __name__=='__main__':unittest.main()
