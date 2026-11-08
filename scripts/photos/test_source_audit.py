import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import source_audit as audit
import test_pipeline


class SourceAuditTests(unittest.TestCase):
    def test_malformed_200_responses_are_errors_not_empty_coverage(self):
        with patch.object(audit, 'fetch_json', return_value={'unexpected': 'shape'}):
            row = audit.run_one('wikidata', {'query': 'Carbonara'}, 5)
        self.assertEqual(row['outcome'], 'error')
        self.assertEqual(row['error'], 'invalid_wikidata_shape')
        with patch.object(audit, 'commons_api', return_value={}):
            row = audit.run_one('commons', {'query': 'Carbonara'}, 5)
        self.assertEqual(row['outcome'], 'error')
        self.assertEqual(row['error'], 'invalid_commons_shape')

    def test_noncommercial_and_small_photos_are_not_eligible(self):
        page = test_pipeline.PipelineTests().fixture()
        page['imageinfo'][0]['extmetadata']['LicenseShortName']['value'] = 'CC BY-NC 4.0'
        with patch.object(audit, 'commons_api', return_value={'query': {'pages': {'42': page}}}):
            result = audit.commons({'query': 'Carbonara'}, 5)
        self.assertEqual(result['candidates'], [])
        self.assertEqual(result['held'][0]['reason'], 'licence_not_allowlisted')

    def test_p18_does_not_prove_food_or_identity(self):
        page = test_pipeline.PipelineTests().fixture()
        search = {'search': [{'id': 'Q1', 'label': 'Napoleon', 'description': 'emperor'}]}
        entity = {'entities': {'Q1': {'claims': {'P18': [{'mainsnak': {'datavalue': {'value': 'Carbonara.jpg'}}}]}}}}
        with patch.object(audit, 'fetch_json', side_effect=[search, entity]), patch.object(audit, 'commons_api', return_value={'query': {'pages': {'42': page}}}):
            result = audit.wikidata({'query': 'Napoleon'}, 5)
        self.assertFalse(result['candidates'][0]['approved'])
        self.assertEqual(result['candidates'][0]['entityHints'][0]['description'], 'emperor')

    def test_mealdb_is_held_for_paid_publication_even_when_cc_flag_is_yes(self):
        body = {'meals': [{'idMeal': '1', 'strMeal': 'Carbonara', 'strMealThumb': 'https://www.themealdb.com/a.jpg', 'strCreativeCommons': 'Yes'}]}
        with patch.object(audit, 'fetch_json', return_value=body):
            photo = audit.mealdb({'query': 'Carbonara'}, 5)['candidates'][0]
        self.assertFalse(photo['approved'])
        self.assertIn('paid_api_access_required', photo['publicationHolds'])

    def test_errors_and_negative_controls_never_inflate_positive_coverage(self):
        photo = {'id': '1'}
        dish = {'name': 'Carbonara', 'cuisine': 'Italian'}
        rows = [dict(source='commons', dish=dish, outcome='ok', candidates=[photo]),
                dict(source='commons', dish={'name': 'Napoleon', 'cuisine': 'Control', 'negativeControl': True}, outcome='ok', candidates=[photo]),
                dict(source='commons', dish=dish, outcome='error', error='http_403')]
        summary = audit.summarize(rows, 3)['commons']
        self.assertEqual(summary['successfulRequests'], 2)
        self.assertEqual(summary['positiveDishesWithCandidates'], 1)
        self.assertEqual(summary['negativeControlsWithCandidates'], 1)
        self.assertEqual(summary['approvedPhotos'], 0)
        self.assertEqual(summary['identityVerifiedDishes'], 0)

    def test_bridge_deduplicates_and_never_imports_mealdb_or_approves(self):
        photo, _ = audit.candidate(test_pipeline.PipelineTests().fixture(), 'Dish-first search: Carbonara')
        control = {**photo, 'id': 'commons-43', 'sourcePageId': 43}
        rows = [dict(candidates=[photo, photo, {'source': 'themealdb', 'id': 'mealdb-1'}]),
                dict(dish={'negativeControl': True}, candidates=[control])]
        with tempfile.TemporaryDirectory() as folder:
            path = str(Path(folder) / 'candidates.sqlite')
            self.assertEqual(audit.export_commons(rows, path), 1)
            db = sqlite3.connect(path)
            status, record = db.execute('SELECT status,record FROM files').fetchone()
            self.assertEqual(status, 'pending_review')
            self.assertFalse(json.loads(record)['approved'])
            db.close()

    def test_review_html_escapes_metadata_and_does_not_link_script_urls(self):
        rows = [dict(source='commons', dish={'name': '<script>bad</script>'}, candidates=[dict(
            id='1', title='<img onerror=bad>', sourceUrl='javascript:bad', licenseUrl='data:text/html,bad')])]
        with tempfile.TemporaryDirectory() as folder:
            audit.write_review(rows, Path(folder))
            content = (Path(folder) / 'review.html').read_text()
        self.assertNotIn('javascript:bad', content)
        self.assertNotIn('<script>bad</script>', content)
        self.assertIn('&lt;img onerror=bad&gt;', content)

    def test_upstream_errors_do_not_log_arbitrary_secret_text(self):
        with patch.dict(audit.PROVIDERS, {'test': lambda *_: (_ for _ in ()).throw(ValueError('secret credential'))}):
            row = audit.run_one('test', {'query': 'Carbonara'}, 5)
        self.assertEqual(row['error'], 'ValueError')
        self.assertNotIn('secret', json.dumps(row))


if __name__ == '__main__':
    unittest.main()
