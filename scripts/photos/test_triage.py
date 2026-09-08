import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import argparse
import triage

class TriageTests(unittest.TestCase):
    def visual(self):
        return dict(food_depiction='actual_food', scores=dict(sharpness=4, lighting=4, composition=4, appeal=4), watermark=False, photograph_likely=True, recommendation='display_candidate')

    def test_visual_hard_gates(self):
        v = self.visual()
        self.assertEqual(triage.decision(v, 'visual'), 'display_candidate')
        v['scores']['composition'] = 3
        self.assertEqual(triage.decision(v, 'visual'), 'manual_check')
        v['watermark'] = True
        self.assertEqual(triage.decision(v, 'visual'), 'reject')
        v['scores']['appeal'] = True
        with self.assertRaises(ValueError): triage.decision(v, 'visual')

    def test_printed_food_never_passes(self):
        v = self.visual()
        v['food_depiction'] = 'printed_food'
        self.assertEqual(triage.decision(v, 'visual'), 'reject')
        del v['food_depiction']
        self.assertEqual(triage.decision(v, 'visual'), 'manual_check')

    def test_identity_requires_evidence_and_no_inferred_fields(self):
        v = dict(canonical_name='Baguette', identity_score=4, source_agreement=True, evidence_quote='Baguette', visible_support=['Long scored loaf'], uncertainties=[])
        evidence = dict(title='Baguette at a stall')
        self.assertEqual(triage.decision(v, 'identity', evidence), 'shortlist')
        v['aliases'] = ['pain']
        self.assertEqual(triage.decision(v, 'identity', evidence), 'manual_check')
        del v['aliases']
        v['evidence_quote'] = 'invented source'
        self.assertEqual(triage.decision(v, 'identity', evidence), 'manual_check')

    def test_fences_truncation_and_api_errors(self):
        row = dict(result=dict(type='succeeded', message=dict(stop_reason='end_turn', content=[dict(type='text', text='```json\n{"a": 1}\n```')])))
        self.assertEqual(triage.model_json(row), {'a': 1})
        row['result']['message']['stop_reason'] = 'max_tokens'
        with self.assertRaises(ValueError): triage.model_json(row)
        with self.assertRaises(ValueError): triage.model_json({'result': {'type': 'errored'}})

    def test_utf8_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'test.json'
            triage.write_json(p, {'name': 'Bánh mì 麻婆豆腐'}, exclusive=True)
            self.assertEqual(triage.read_json(p)['name'], 'Bánh mì 麻婆豆腐')
            with self.assertRaises(FileExistsError): triage.write_json(p, {}, exclusive=True)

    def test_visual_blind_identity_reuses_exact_image(self):
        import sqlite3
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            db = root / 'db.sqlite'
            c = sqlite3.connect(db)
            c.execute('CREATE TABLE files (record TEXT, category TEXT, pageid INTEGER, status TEXT)')
            photo = dict(author='Photographer', license='CC BY-SA 4.0', licenseUrl='https://creativecommons.org/licenses/by-sa/4.0/', id='commons-1', title='Bánh mì', description='Sandwich', discoveryCategory='Bread', sourceUrl='https://commons.wikimedia.org/', commonsSha1='abc', previewUrl='https://upload.wikimedia.org/a.jpg')
            c.execute('INSERT INTO files VALUES (?, ?, ?, ?)', (json.dumps(photo), 'Bread', 1, 'pending_review'))
            c.commit(); c.close()
            out = root / 'visual.json'
            args = argparse.Namespace(out=str(out), limit=3, offset=0, stage='visual', db=str(db), from_batch=None, visual_results=None, model='test')
            image = dict(type='base64', media_type='image/jpeg', data='test')
            with patch.object(triage, 'image_source', return_value=image): triage.prepare(args)
            content = triage.read_json(out)['requests'][0]['params']['messages'][0]['content']
            self.assertEqual(len(content), 1)
            result = root / 'visual.job.results.jsonl'
            result.write_text(json.dumps(dict(custom_id='commons-1', result=dict(type='succeeded', message=dict(stop_reason='end_turn', content=[dict(type='text', text=json.dumps(self.visual()))])))), encoding='utf-8')
            args.stage='identity'; args.from_batch=str(out); args.visual_results=str(result); args.out=str(root / 'identity.json')
            with patch.object(triage, 'image_source', side_effect=AssertionError('Should reuse image')): triage.prepare(args)
            identity = triage.read_json(args.out)['requests'][0]['params']['messages'][0]['content']
            self.assertEqual(identity[0]['source'], image)
            self.assertIn('Bánh mì', identity[1]['text'])
            summary = triage.summarize(result, triage.read_json(out.with_suffix('.manifest.json')))
            self.assertEqual(summary['screening'], {'display_candidate': 1})
            self.assertEqual(summary['approved'], 0)

    def test_host_validation(self):
        for url in ['http://upload.wikimedia.org/a', 'https://evil.test/a', 'https://upload.wikimedia.org:8443/a']:
            with self.assertRaises(ValueError): triage.validate_url(url, ('upload.wikimedia.org',))

if __name__ == '__main__': unittest.main()
