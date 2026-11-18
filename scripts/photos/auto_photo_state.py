"""Compact durable queues for continuous intake; no provider operations."""
import gzip
import json


def read_rows(folder, name, compressed=False):
    path = folder / (name + ('.json.gz' if compressed else '.json'))
    if not path.exists():
        return []
    data = gzip.decompress(path.read_bytes()).decode('utf-8') if compressed else path.read_text(encoding='utf-8-sig')
    rows = json.loads(data)
    if not isinstance(rows, list):
        raise ValueError('Queue state must be a list')
    return rows


def write_compressed_rows(folder, name, rows):
    path = folder / (name + '.json.gz')
    temporary = path.with_name(path.name + '.tmp')
    raw = json.dumps(rows, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    temporary.write_bytes(gzip.compress(raw, compresslevel=6, mtime=0))
    temporary.replace(path)
