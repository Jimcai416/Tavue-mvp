"""Report durable queue completion; a saved runtime checkpoint is not completion."""
import argparse
import json
import os
from pathlib import Path
from auto_photo_state import read_rows

ROOT = Path(__file__).resolve().parents[2]


def progress(ledger, candidates, decisions):
    candidate_ids = {row['id'] for row in candidates}
    decided_ids = {row['id'] for row in decisions}
    if len(candidate_ids) != len(candidates) or len(decided_ids) != len(decisions) or not decided_ids <= candidate_ids:
        raise ValueError('Queue IDs are duplicated or inconsistent')
    remaining = len(candidate_ids - decided_ids)
    if ledger['remaining'] != remaining or ledger['processed'] != len(decisions):
        raise ValueError('Ledger counters disagree with durable decisions')
    spent = ledger.get('priorAccountedUSD', 0) + sum(row.get('actualUSD', row.get('reservedUSD', 0)) for row in ledger['requests'].values())
    locked = any(row['status'] in ('reserved', 'ambiguous') for row in ledger['requests'].values())
    campaign = ledger['config'].get('continuousDiscovery', False)
    target = ledger['config'].get('targetPhotos')
    target_met = bool(target and ledger.get('bundledPhotos', 0) >= target)
    return {
        'status': ledger['status'],
        'remaining': remaining,
        'approved': ledger['newApproved'],
        'bundledPhotos': ledger.get('bundledPhotos', 0),
        'accountedUSD': round(spent, 6),
        'targetPhotos': target,
        'targetRemaining': max(0, target-ledger.get('bundledPhotos', 0)) if target else None,
        'budgetUSD': ledger['config']['budgetUSD'],
        'complete': (ledger['status'] == 'target_reached' and target_met if campaign else ledger['status'] == 'completed' and remaining == 0) and not locked,
        'needsContinue': ledger['status'] == 'time_limit' and (not target_met if campaign else remaining > 0) and spent < ledger['config']['budgetUSD'] and not locked,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-complete', action='store_true')
    args = parser.parse_args()
    read = lambda path: json.loads(path.read_text(encoding='utf-8-sig'))
    config = read(ROOT / 'catalog/auto-photo-request.json')
    folder = ROOT / 'catalog/auto-runs' / config['requestId']
    ledger = read(folder / 'ledger.json')
    compressed = ledger['config'].get('compressedState', False)
    report = progress(ledger, read_rows(folder, 'candidates', compressed), read_rows(folder, 'decisions', compressed))
    print(json.dumps(report), flush=True)
    if os.environ.get('GITHUB_OUTPUT'):
        with open(os.environ['GITHUB_OUTPUT'], 'a', encoding='utf-8') as output:
            output.write('needsContinue=' + str(report['needsContinue']).lower() + '\n')
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as summary:
            summary.write(f"### Photo campaign: {report['status']}\n\nPending candidates: {report['remaining']}; newly approved: {report['approved']}; bundled: {report['bundledPhotos']} / {report['targetPhotos'] or 'queue only'}; target shortfall: {report['targetRemaining']}; cumulative accounted/reserved: ${report['accountedUSD']:.6f} / ${report['budgetUSD']:.2f}.\n")
    if args.require_complete and not report['complete']:
        raise SystemExit('Requested photo goal is unfinished; see explicit budget/error/checkpoint status and target shortfall above.')


if __name__ == '__main__':
    main()
