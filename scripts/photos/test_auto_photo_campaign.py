import copy
import gzip
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import auto_photos as a
import auto_photo_campaign as c
from auto_photo_state import read_rows, write_compressed_rows


class CampaignTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.config = {'requestId': 'test-campaign', 'policy': 'user-authorized-continuous-v2',
                       'model': a.MODEL, 'budgetUSD': 100, 'targetPhotos': 10000,
                       'continuousDiscovery': True, 'compressedState': True,
                       'reviewVersion': c.REVIEW_VERSION, 'priorRunIds': ['prior'],
                       'concurrency': 6, 'maxQueries': 180, 'resultsPerQuery': 30,
                       'maxCandidates': 100000, 'maxRounds': 200, 'maxEmptyRounds': 3, 'seconds': 17400}
        self.prior_path = self.root / 'catalog/auto-runs/prior/ledger.json'
        a.triage.write_json(self.prior_path, {'requests': {'old-photo': {'status': 'completed', 'actualUSD': 9.44}}, 'accountedUSD': 9.44})
        self.root_patch = patch.object(a, 'ROOT', self.root)
        self.root_patch.start(); self.addCleanup(self.root_patch.stop)
        self.key_patch = patch.object(a.triage, 'api_key', return_value='test-key')
        self.key_patch.start(); self.addCleanup(self.key_patch.stop)
        self.catalogue_patch = patch.object(a, 'catalogue', return_value=([{'id': 'prior-photo', 'name': 'Already covered'}], []))
        self.catalogue_patch.start(); self.addCleanup(self.catalogue_patch.stop)
        self.environment = patch.dict('os.environ', {'GITHUB_ACTIONS': 'false'})
        self.environment.start(); self.addCleanup(self.environment.stop)

    def campaign(self):
        return c.Campaign(copy.deepcopy(self.config))

    def round_row(self):
        return {'number': 1, 'status': 'planning', 'startedCount': 0, 'newCandidates': 0,
                'plannerKey': 'planner-round-0001', 'planFile': 'round-0001-plan.json', 'searchFile': 'round-0001-search.json'}

    def test_cumulative_cap_includes_prior_usage_and_does_not_reset(self):
        self.config['budgetUSD'] = 9.45
        p = self.campaign()
        p.ledger['requests']['new'] = {'status': 'completed', 'actualUSD': .009}
        before = copy.deepcopy(p.ledger['requests'])
        self.assertAlmostEqual(p.accounted(), 9.449)
        self.assertFalse(p.reserve('another', {'max_tokens': 1100}, counted=1000))
        self.assertEqual(before, p.ledger['requests'])

    def test_compressed_checkpoint_resumes_same_queue_and_spending(self):
        p = self.campaign(); p.records = [{'id': 'one', 'title': 'Bún bò Huế'}]
        p.persist('test compressed checkpoint')
        self.assertTrue((p.out / 'candidates.json.gz').exists())
        self.assertFalse((p.out / 'candidates.json').exists())
        again = self.campaign()
        self.assertEqual(again.records, p.records)
        self.assertAlmostEqual(again.accounted(), 9.44)

    def test_changed_prior_spending_is_rejected_after_checkpoint(self):
        p = self.campaign(); p.persist('freeze prior receipts')
        a.triage.write_json(self.prior_path, {'requests': {'old-photo': {'status': 'completed', 'actualUSD': 9.45}}, 'accountedUSD': 9.45})
        with self.assertRaisesRegex(ValueError, 'prior spending'):
            self.campaign()

    def test_uncertain_prior_spending_is_not_treated_as_zero(self):
        a.triage.write_json(self.prior_path, {'requests': {'old-photo': {'status': 'ambiguous', 'reservedUSD': .01}}, 'accountedUSD': .01})
        with self.assertRaises(ValueError):
            self.campaign()

    def test_new_search_round_starts_immediately_after_queue_exhaustion(self):
        p = self.campaign()
        def discover(row):
            row.update(status='reviewing', newCandidates=1)
            if row['number'] == 1:
                p.records.append({'id': 'one'})
            else:
                p.ledger['bundledPhotos'] = 10000
        def review():
            p.decisions = [{'id': 'one', 'verdict': 'held', 'reason': 'model_hold'}]
            p.ledger['status'] = 'completed'
        with patch.object(p, 'api', return_value={'id': a.MODEL}), patch.object(p, 'persist'), patch.object(p, 'discover_round', side_effect=discover) as discover_call, patch.object(p, 'review', side_effect=review) as review_call:
            p.run()
        self.assertEqual(discover_call.call_count, 2)
        review_call.assert_called_once()
        self.assertEqual(p.ledger['rounds'][0]['status'], 'completed')
        self.assertEqual(p.ledger['status'], 'target_reached')

    def test_three_empty_rounds_stop_without_marking_goal_complete(self):
        p = self.campaign()
        def discover(row): row.update(status='reviewing', newCandidates=0)
        with patch.object(p, 'api', return_value={'id': a.MODEL}), patch.object(p, 'persist'), patch.object(p, 'discover_round', side_effect=discover) as discover_call:
            p.run()
        self.assertEqual(discover_call.call_count, 3)
        self.assertEqual(p.ledger['status'], 'source_exhausted')

    def test_target_already_met_prevents_another_search_or_paid_review(self):
        p = self.campaign(); p.ledger['bundledPhotos'] = 10000
        with patch.object(p, 'api', return_value={'id': a.MODEL}), patch.object(p, 'persist'), patch.object(p, 'paid') as paid:
            p.run()
        paid.assert_not_called()
        self.assertEqual(p.ledger['status'], 'target_reached')
        self.assertEqual(p.ledger['rounds'], [])

    def test_saved_planner_response_is_used_without_repeating_paid_post(self):
        p = self.campaign(); row = self.round_row()
        message = {'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': json.dumps({'queries': [{'dish': 'Khao soi', 'query': 'Khao soi', 'cuisine': 'Thai'}]})}]}
        p.ledger['requests'][row['plannerKey']] = {'status': 'completed', 'actualUSD': .01}
        a.triage.write_json(p.out / (row['plannerKey']+'-response.json'), message)
        with patch.object(p, 'persist'), patch.object(p, 'paid') as paid:
            queries = p.plan_round(row)
        self.assertEqual(queries[0]['dish'], 'Khao soi')
        paid.assert_not_called()

    def test_missing_reserved_planner_is_not_resubmitted(self):
        p = self.campaign(); row = self.round_row()
        p.ledger['requests'][row['plannerKey']] = {'status': 'reserved', 'reservedUSD': .08}
        with patch.object(p, 'paid') as paid:
            with self.assertRaises(c.CampaignStop): p.plan_round(row)
        paid.assert_not_called()

    def test_new_source_ids_and_original_hashes_are_both_deduplicated(self):
        p = self.campaign(); row = self.round_row(); row['status'] = 'discovering'
        query = {'dish': 'New dish', 'query': 'New dish', 'cuisine': 'Test'}
        pages = {'query': {'pages': {str(i): {'imageinfo': [{}]} for i in range(3)}}}
        records = [({'id': 'old-id', 'commonsSha1': 'unique'}, None),
                   ({'id': 'new-id-same-sha', 'commonsSha1': 'old-sha'}, None),
                   ({'id': 'new-id', 'commonsSha1': 'new-sha'}, None)]
        with patch.object(p, 'plan_round', return_value=[query]), patch.object(p, 'known_sources', return_value=({'old-id'}, {'old-sha'})), patch.object(a.collect, 'api', return_value=pages), patch.object(a.collect, 'candidate', side_effect=records), patch.object(p, 'persist'), patch.object(p, 'paid') as paid:
            p.discover_round(row)
        self.assertEqual([r['id'] for r in p.records], ['new-id'])
        journal = a.read(p.out / row['searchFile'])
        self.assertEqual(journal[0]['duplicateSourceCount'], 2)
        paid.assert_not_called()

    def test_coverage_priority_skips_do_not_claim_visual_review(self):
        p = self.campaign()
        wave = [{'id': 'one', 'commonsSha1': 's1', 'title': 'File:Different variant.jpg', 'searchDish': 'Already covered'},
                {'id': 'two', 'commonsSha1': 's2', 'title': 'File:New dish.jpg', 'searchDish': 'New dish'}]
        self.assertEqual(p.filter_wave(wave), [wave[1]])
        self.assertEqual(p.decisions[0]['reviewedBy'], 'mechanical-coverage-filter')
        self.assertNotIn('modelOutput', p.decisions[0])

    def test_campaign_config_rejects_budget_increase_and_implicit_old_cost(self):
        c.validate_config(self.config)
        for change in ({'budgetUSD': 101}, {'priorRunIds': []}, {'priorRunIds': ['prior', 'prior']}, {'priorRunIds': [{}]}, {'targetPhotos': 9999}):
            with self.assertRaises(ValueError): c.validate_config({**self.config, **change})

    def test_new_policy_preserves_reviewed_bytes_and_real_phone_thumbnail(self):
        import base64, hashlib, io
        from PIL import Image
        p=self.campaign(); path=p.work/'one.jpg'
        Image.new('RGB',(240,200),'red').save(path)
        before=hashlib.sha256(path.read_bytes()).hexdigest()
        record={k:'source metadata' for k in ('title','description','author','license','licenseUrl','requiredCredit')}
        record['id']='one'
        with patch.object(a.triage,'source_flags',return_value=[]),patch.object(a.triage,'image_source') as network:
            _,body,error=p.prepare(record)
        self.assertIsNone(error);network.assert_not_called()
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),before)
        pictures=[b['source'] for b in body['messages'][0]['content'] if b['type']=='image']
        self.assertEqual(len(pictures),2)
        self.assertEqual(Image.open(io.BytesIO(base64.b64decode(pictures[1]['data']))).size,(124,96))
        self.assertEqual(a.digest(body['system'].encode()),p.ledger['reviewPromptSha256'])


class DiscoveryHelpersTests(unittest.TestCase):
    def test_source_queries_are_interleaved_before_more_photos_of_same_dish(self):
        rows = [{'id': 'a1', 'searchDish': 'A'}, {'id': 'a2', 'searchDish': 'A'}, {'id': 'a3', 'searchDish': 'A'}, {'id': 'b1', 'searchDish': 'B'}, {'id': 'b2', 'searchDish': 'B'}]
        self.assertEqual([r['id'] for r in c.fair_order(rows)], ['a1', 'b1', 'a2', 'b2', 'a3'])

    def test_planner_duplicates_covered_names_operators_and_empty_terms_are_removed(self):
        query = lambda dish, q=None: {'dish': dish, 'query': q or dish, 'cuisine': 'Test'}
        rows = [query('Used'), query('Covered'), query('New'), query('NEW'), query('Food'), query('Bad', 'https://example.com'), query('   ')]
        result = c.valid_queries({'queries': rows}, {'used'}, {'covered'}, 180)
        self.assertEqual([r['dish'] for r in result], ['New'])

    def test_compressed_unicode_rows_round_trip_and_stable_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory); rows = [{'id': 'one', 'name': '红烧肉 / Bún bò Huế'}]
            write_compressed_rows(folder, 'candidates', rows)
            first = (folder / 'candidates.json.gz').read_bytes()
            self.assertEqual(read_rows(folder, 'candidates', True), rows)
            write_compressed_rows(folder, 'candidates', rows)
            self.assertEqual(first, (folder / 'candidates.json.gz').read_bytes())
            (folder / 'decisions.json.gz').write_bytes(gzip.compress(b'{}'))
            with self.assertRaises(ValueError): read_rows(folder, 'decisions', True)


if __name__ == '__main__':
    unittest.main()
