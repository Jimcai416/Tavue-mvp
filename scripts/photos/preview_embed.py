"""Embed Wikimedia bitmap previews for portable, offline review pages."""
import base64
from urllib.parse import urlparse
from urllib.request import Request, urlopen

MAX_BYTES = 12 * 1024 * 1024

def embed_preview(url):
    parsed = urlparse(url)
    if parsed.scheme != 'https' or parsed.hostname not in {'upload.wikimedia.org', 'thumb.wikimedia.org'}:
        raise ValueError('Only HTTPS Wikimedia image hosts are allowed')
    request = Request(url, headers={'User-Agent': 'TavuePhotoReview/1.0 (offline candidate review)'})
    with urlopen(request, timeout=30) as response:
        if urlparse(response.url).hostname not in {'upload.wikimedia.org', 'thumb.wikimedia.org'}:
            raise ValueError('Unexpected image redirect')
        data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError('Preview exceeds 12 MB')
        if data.startswith(b'\xff\xd8\xff'):
            mime = 'image/jpeg'
        elif data.startswith(b'\x89PNG\r\n\x1a\n'):
            mime = 'image/png'
        elif data[:6] in (b'GIF87a', b'GIF89a'):
            mime = 'image/gif'
        elif data[:4] == b'RIFF' and data[8:12] == b'WEBP':
            mime = 'image/webp'
        else:
            raise ValueError('Response is not a supported bitmap')
    return 'data:' + mime + ';base64,' + base64.b64encode(data).decode('ascii')
