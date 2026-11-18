"""Report durable queue completion; a saved runtime checkpoint is not completion."""
import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def progress(ledger, candidates, decisions):
    candidate_ids = {row['id'] for row in candidates}
    decided_ids = {row['id'] for row in decisions}
    if len(candidate_ids) != len(candidates) or len(decided_ids) != len(decisions) or not decided_ids <= candidate_ids:
        raise ValueError('Queue IDs are duplicated or inconsistent')
    remaining = len(candidate_ids - decided_ids)
    if ledger['remaining'] != remaining or ledger['processed'] != len(decisions):
        raise ValueError('Ledger counters disagree with durable decisions')
    spent = sum(row.get('actualUSD', row.get('reservedUSD', 0)) for row in ledger['requests'].values())
    locked = any(row['status'] in ('reserved', 'ambiguous') for row in ledger['requests'].values())
    return {
        'status': ledger['status'],
        'remaining': remaining,
        'approved': ledger['newApproved'],
        'bundledPhotos': ledger.get('bundledPhotos', 0),
        'accountedUSD': round(spent, 6),
        'complete': ledger['status'] == 'completed' and remaining == 0 and not locked,
        'needsContinue': ledger['status'] == 'time_limit' and remaining > 0 and spent < ledger['config']['budgetUSD'] and not locked,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-complete', action='store_true')
    args = parser.parse_args()
    read = lambda path: json.loads(path.read_text(encoding='utf-8-sig'))
    config = read(ROOT / 'catalog/auto-photo-request.json')
    folder = ROOT / 'catalog/auto-runs' / config['requestId']
    report = progress(read(folder / 'ledger.json'), read(folder / 'candidates.json'), read(folder / 'decisions.json'))
    print(json.dumps(report), flush=True)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
            output.write('needsContinue=' + str(report['needsContinue']).lower() + '\n')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as summary:
            summary.write(f"### Photo queue: {report['status']}\n\nRemaining: {report['remaining']}; newly approved: {report['approved']}; bundled: {report['bundledPhotos']}; accounted: ${report['accountedUSD']:.6f}.\n")
    if args.require_complete and not report['complete']:
        raise SystemExit('Photo queue is unfinished; see saved status, remaining count and budget above.')


if __name__ == '__main__':
    main()
