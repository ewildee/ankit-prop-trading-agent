#!/usr/bin/env bash

set -euo pipefail

readonly REQUIRED_PAPERCLIP_TRAILER='Co-Authored-By: Paperclip <noreply@paperclip.ing>'
readonly PAPERCLIP_TRAILER_PATTERN='^co-authored-by: paperclip <noreply@paperclip[.]ing>$'
readonly RULE_LINK='AGENTS.md commit footer rule and ANKA-137'

is_github_merge_commit() {
  local sha=$1
  local subject=$2
  local parent_count

  [[ "$subject" == Merge\ pull\ request\ \#* ]] || return 1

  parent_count=$(git show -s --format=%P "$sha" | wc -w | tr -d ' ')
  [ "$parent_count" -ge 2 ]
}

print_footer_error() {
  local sha=$1
  local observed=$2

  {
    printf 'ERROR: commit %s is missing the canonical Paperclip co-author trailer.\n' "$sha"
    printf 'observed: %s\n' "$observed"
    printf 'required: %s\n' "$REQUIRED_PAPERCLIP_TRAILER"
    printf 'See %s: /AGENTS.md and /ANKA/issues/ANKA-137\n' "$RULE_LINK"
  } >&2
}

check_commit_footer_range() {
  local range=$1
  local commits_file
  local commit_count
  local sha

  commits_file=$(mktemp)
  trap 'rm -f "$commits_file"' RETURN

  git rev-list --reverse "$range" >"$commits_file"
  commit_count=$(wc -l <"$commits_file" | tr -d ' ')

  if [ "$commit_count" = "0" ]; then
    printf 'No commits found for range %s; nothing to check.\n' "$range"
    return 0
  fi

  while IFS= read -r sha; do
    [ -n "$sha" ] || continue

    local subject

    subject=$(git log -1 --format=%s "$sha")

    if [ "$commit_count" = "1" ] && is_github_merge_commit "$sha" "$subject"; then
      printf 'Skipping single GitHub merge commit %s (%s).\n' "$sha" "$subject"
      continue
    fi

    local message
    local trailers
    local observed

    message=$(git log -1 --format=%B "$sha")
    trailers=$(printf '%s\n' "$message" | git interpret-trailers --parse)

    if printf '%s\n' "$trailers" | grep -Fxq "$REQUIRED_PAPERCLIP_TRAILER"; then
      continue
    fi

    observed=$(
      printf '%s\n' "$trailers" |
        grep -Ei "$PAPERCLIP_TRAILER_PATTERN" |
        grep -Fvx "$REQUIRED_PAPERCLIP_TRAILER" |
        head -n 1 || true
    )

    if [ -z "$observed" ]; then
      observed='<missing>'
    fi

    print_footer_error "$sha" "$observed"
    return 1
  done <"$commits_file"
}

if [[ "${BASH_SOURCE[0]}" = "$0" ]]; then
  if [ "$#" -ne 1 ]; then
    printf 'usage: %s <base..head>\n' "$0" >&2
    exit 2
  fi

  check_commit_footer_range "$1"
fi
