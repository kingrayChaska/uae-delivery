#!/usr/bin/env python3
"""Grades attacks.sql output: every ATTACK must be blocked (ERROR, UPDATE 0,
or a zero count) and no LEGITIMATE step may error.

Usage: psql -d uae_delivery_test -f attacks.sql 2>&1 | python3 grade.py
"""
import sys

lines = sys.stdin.read().splitlines()
problems = []
total = 0
for i, line in enumerate(lines):
    if not line.startswith(('ATTACK', 'LEGITIMATE')):
        continue
    total += 1
    block = []
    for nxt in lines[i + 1:]:
        if nxt.startswith(('ATTACK', 'LEGITIMATE', 'expect')):
            break
        block.append(nxt)
    errored = any('ERROR' in b for b in block)
    blocked = errored or any(b.strip() in ('UPDATE 0', '0') for b in block)
    if line.startswith('ATTACK') and not blocked:
        problems.append(f'NOT BLOCKED: {line}')
    if line.startswith('LEGITIMATE') and errored:
        problems.append(f'BROKEN: {line}')

# A run that executed nothing (database down, wrong DB name, psql error)
# must never read as a pass.
if total == 0:
    problems.append('NO CHECKS RAN — is Postgres running and did run.sh succeed?')

print(f'{total} labelled checks, {len(problems)} problem(s)')
for problem in problems:
    print('  ' + problem)
sys.exit(1 if problems else 0)
