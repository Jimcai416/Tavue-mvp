import unittest
from unittest.mock import patch
from preview_embed import embed_preview

class PreviewTests(unittest.TestCase):
    def response(self, data):
        from io import BytesIO
        response = BytesIO(data)
        response.url = 'https://upload.wikimedia.org/test.jpg'
        return response

    def test_bitmap_embedded(self):
        with patch('preview_embed.urlopen', return_value=self.response(b'\xff\xd8\xffimage')):
            self.assertEqual(embed_preview('https://upload.wikimedia.org/test.jpg'),
                             'data:image/jpeg;base64,/9j/aW1hZ2U=')

    def test_html_not_embedded(self):
        with patch('preview_embed.urlopen', return_value=self.response(b'<html>error</html>')):
            with self.assertRaises(ValueError):
                embed_preview('https://upload.wikimedia.org/test.jpg')

    def test_foreign_host_not_requested(self):
        with patch('preview_embed.urlopen') as request:
            with self.assertRaises(ValueError):
                embed_preview('https://example.com/test.jpg')
            request.assert_not_called()

if __name__ == '__main__':
    unittest.main()
