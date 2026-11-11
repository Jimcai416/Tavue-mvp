import unittest
from bulk_plan import plan

def record(i,sha=None,category='A'):
    return dict(id=str(i),commonsSha1=sha or str(i),sourcePageId=i,
                author='a',license='CC0',licenseUrl='https://example.test/license',
                sourceUrl='https://example.test/source',title='dish',discoveryCategory=category)

class PlanTests(unittest.TestCase):
    def test_existing_decisions_only_skip_matching_hash(self):
        rows,batches=plan([record(1),record(2)], [{'id':'1','sourceSha1':'old','decision':'reject'},{'id':'2','sourceSha1':'2','verdict':'approved'}])
        self.assertEqual([r['state'] for r in rows],['needs_visual_review','prior_result_preserved'])
        self.assertEqual([r['id'] for r in batches[0]],['1'])
        self.assertFalse(any(r['approved'] for r in rows))
    def test_duplicate_hash_and_missing_metadata_held(self):
        incomplete=record(3);incomplete['author']=''
        rows,batches=plan([record(1),record(2,sha='1'),incomplete])
        self.assertEqual([r['state'] for r in rows],['needs_visual_review','duplicate_source_hash','hold_missing_metadata'])
        self.assertEqual(len(batches[0]),1)
    def test_balanced_deterministic_batches(self):
        data=[record(1,category='B'),record(2,category='A'),record(3,category='A')]
        self.assertEqual([[r['id'] for r in b] for b in plan(data,batch_size=2)[1]],[['2','1'],['3']])
        self.assertEqual(plan(data),plan(list(reversed(data))))
    def test_rejects_unknown_or_unhashed_prior_result(self):
        for previous in [[{'id':'1','decision':'reject'}],[{'id':'1','sourceSha1':'1','decision':'error'}]]:
            with self.assertRaises(ValueError):plan([record(1)],previous)
    def test_duplicate_ids_fail(self):
        with self.assertRaises(ValueError):plan([record(1),record(1)])

if __name__=='__main__':unittest.main()
