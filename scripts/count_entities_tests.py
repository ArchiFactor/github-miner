# Count JPA entity classes (@Entity) and test methods (@Test) in cloned repos.
# Usage: python count_entities_tests.py [projects-dir]
#   Each immediate subdirectory of projects-dir is treated as one project
#   (clone-repos.sh names them owner__repo). Defaults to the current dir.
# Output: entity-test-counts.csv (repo,entities,tests) sorted by entities desc.
#
# Word boundaries keep @EntityScan/@EntityGraph/@EntityListeners and
# @TestConfiguration/@Testcontainers out of the counts. Not counted:
# @ParameterizedTest/@RepeatedTest, Kotlin sources, XML-mapped entities.

import csv
import os
import re
import sys

ENTITY = re.compile(r'@Entity\b')
TEST = re.compile(r'@Test\b')

root = sys.argv[1] if len(sys.argv) > 1 else '.'
rows = []

for name in sorted(os.listdir(root)):
    path = os.path.join(root, name)
    if not os.path.isdir(path) or name.startswith('.'):
        continue
    entities = tests = 0
    for dirpath, dirnames, filenames in os.walk(path):
        dirnames[:] = [d for d in dirnames if d != '.git']
        for fn in filenames:
            if fn.endswith('.java'):
                try:
                    with open(os.path.join(dirpath, fn), encoding='utf-8', errors='ignore') as f:
                        text = f.read()
                except OSError:
                    continue
                entities += len(ENTITY.findall(text))
                tests += len(TEST.findall(text))
    rows.append((name.replace('__', '/'), entities, tests))

rows.sort(key=lambda r: (-r[1], -r[2]))
with open('entity-test-counts.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['repo', 'entities', 'tests'])
    writer.writerows(rows)

print(f'Wrote {len(rows)} repos to entity-test-counts.csv')
