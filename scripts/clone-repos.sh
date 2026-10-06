#!/bin/bash
# Clone all repos listed in a file (one owner/repo per line) as shallow clones.
# Usage: ./clone-repos.sh [repo-list-file] [target-dir]
#   defaults: repos-to-clone.txt in the current dir, cloning into the current dir
#
# Generate the merged repo list from the project root with:
#   awk '!seen[$0]++' results-spring-data-jpa-dedup.csv results-quarkus-hibernate-orm-dedup.csv > repos-to-clone.txt
#
# Safe to rerun after an interruption: existing directories are skipped.
# Failed clones are recorded in clone-failures.txt and do not stop the run.

LIST="${1:-repos-to-clone.txt}"
TARGET="${2:-.}"

while IFS= read -r repo; do
    repo="${repo//$'\r'/}"                # strip Windows CR just in case
    [ -z "$repo" ] && continue
    dir="$TARGET/${repo/\//__}"
    if [ -d "$dir" ]; then
        echo "SKIP (exists): $repo"
        continue
    fi
    echo "Cloning $repo ..."
    git clone --depth 1 --quiet "https://github.com/$repo.git" "$dir" \
        || echo "$repo" >> clone-failures.txt
done < "$LIST"

echo "Done. Failures (if any) are listed in clone-failures.txt"
