#!/usr/bin/env just --justfile

# git switch to the HEAD of a PR number. Creates branch if needed
switch_to_pr pr_num:
    #!/usr/bin/env bash
    set -euo pipefail
    git config --add remote.origin.fetch '+refs/pull/*/head:refs/remotes/origin/pr/*'
    git fetch origin
    git switch pr/{{pr_num}} 2>/dev/null || git switch -c pr/{{pr_num}} origin/pr/{{pr_num}};
    git reset --hard origin/pr/{{pr_num}}
