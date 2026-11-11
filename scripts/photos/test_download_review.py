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
