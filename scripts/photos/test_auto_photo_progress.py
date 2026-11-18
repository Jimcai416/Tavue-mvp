import copy
import unittest
from auto_photo_progress import progress


class ProgressTests(unittest.TestCase):
    def setUp(self):
        self.ledger = {'status': 'time_limit', 'remaining': 1, 'processed': 1, 'newApproved': 1,
                       'config': {'budgetUSD': 15}, 'requests': {'a': {'status': 'completed', 'actualUSD': 7.3}}}
        self.candidates = [{'id': 'a'}, {'id': 'b'}]
        self.decisions = [{'id': 'a'}]

    def report(self):
        return progress(self.ledger, self.candidates, self.decisions)

    def test_runtime_checkpoint_continues_without_reporting_complete(self):
        result = self.report()
        self.assertTrue(result['needsContinue'])
        self.assertFalse(result['complete'])
        self.assertEqual(result['accountedUSD'], 7.3)

    def test_budget_limit_and_uncertain_paid_requests_stop_continuation(self):
        original = copy.deepcopy(self.ledger)
        for change in ({'status': 'budget_limit'}, {'requests': {'a': {'status': 'completed', 'actualUSD': 15}}},
                       {'requests': {'a': {'status': 'ambiguous', 'reservedUSD': .01}}}):
            self.ledger = {**original, **change}
            self.assertFalse(self.report()['needsContinue'])
            self.assertFalse(self.report()['complete'])

    def test_completed_label_requires_every_candidate_decision(self):
        self.ledger['status'] = 'completed'
        self.assertFalse(self.report()['complete'])
        self.decisions.append({'id': 'b'})
        self.ledger.update(remaining=0, processed=2)
        self.assertTrue(self.report()['complete'])
        self.assertFalse(self.report()['needsContinue'])

    def test_inconsistent_durable_records_fail_closed(self):
        self.ledger['remaining'] = 0
        with self.assertRaises(ValueError): self.report()
        self.ledger['remaining'] = 1
        self.decisions = [{'id': 'outside-queue'}]
        with self.assertRaises(ValueError): self.report()
        self.decisions = [{'id': 'a'}, {'id': 'a'}]
        with self.assertRaises(ValueError): self.report()


if __name__ == '__main__':
    unittest.main()
