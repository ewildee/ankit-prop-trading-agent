#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  scripts/paperclip-worktree.sh start <issueId> [<base-ref>]
  scripts/paperclip-worktree.sh finish <issueId>
  scripts/paperclip-worktree.sh cleanup

Per-issue worktree helper for the AGENTS.md "Worktree-first for multi-file changes" guard.
EOF
}

die() {
  printf 'paperclip-worktree: %s\n' "$*" >&2
  exit 1
}

repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || die "must be run inside a git work tree"
}

abs_path() {
  local path="$1"
  local parent
  parent="$(dirname "$path")"
  mkdir -p "$parent"
  (cd "$parent" && printf '%s/%s\n' "$(pwd -P)" "$(basename "$path")")
}

issue_from_branch() {
  local branch="$1"
  if [[ "$branch" =~ (ANKA-[0-9]+) ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

start_worktree() {
  local issue_id="${1:-}"
  local base_ref="${2:-origin/main}"
  [[ -n "$issue_id" ]] || die "start requires <issueId>"

  local root path absolute_path
  root="$(repo_root)"
  path="$root/.paperclip/worktrees/$issue_id"
  absolute_path="$(abs_path "$path")"

  if [[ -e "$path" ]]; then
    die "worktree already exists at $absolute_path; inspect existing worktrees with: git worktree list"
  fi

  git -C "$root" fetch origin --quiet

  if git -C "$root" show-ref --verify --quiet "refs/heads/$issue_id"; then
    git -C "$root" worktree add "$path" "$issue_id" >/dev/null
  else
    git -C "$root" worktree add -b "$issue_id" "$path" "$base_ref" >/dev/null
  fi

  printf '%s\n' "$absolute_path"
}

finish_worktree() {
  local issue_id="${1:-}"
  [[ -n "$issue_id" ]] || die "finish requires <issueId>"

  local root path branch
  root="$(repo_root)"
  path="$root/.paperclip/worktrees/$issue_id"
  [[ -d "$path" ]] || die "no worktree exists at $path"

  branch="$(git -C "$path" rev-parse --abbrev-ref HEAD)"
  [[ "$branch" != "HEAD" ]] || die "worktree $path is detached; create or checkout a branch before finishing"

  if [[ -n "$(git -C "$root" status --porcelain)" ]]; then
    die "shared root working tree is dirty; commit or stash changes before running finish"
  fi

  if ! git -C "$root" merge --ff-only "$branch"; then
    die "fast-forward merge failed; rebase $branch onto the current shared-root branch or open a PR"
  fi

  git -C "$root" worktree remove "$path"
}

lookup_issue_status() {
  local issue_id="$1"

  if [[ -z "${PAPERCLIP_API_KEY:-}" || -z "${PAPERCLIP_API_URL:-}" || -z "${PAPERCLIP_COMPANY_ID:-}" ]]; then
    printf 'skip %s: Paperclip API environment is not fully set\n' "$issue_id" >&2
    return 1
  fi

  local response
  if ! response="$(curl -fsS \
    -H "Authorization: Bearer $PAPERCLIP_API_KEY" \
    "$PAPERCLIP_API_URL/api/companies/$PAPERCLIP_COMPANY_ID/issues?q=$issue_id")"; then
    printf 'skip %s: issue lookup failed\n' "$issue_id" >&2
    return 1
  fi

  printf '%s' "$response" | python3 -c '
import json
import sys

issue_id = sys.argv[1]
try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(2)

if isinstance(payload, list):
    issues = payload
elif isinstance(payload, dict):
    issues = payload.get("issues") or payload.get("items") or payload.get("data") or []
else:
    issues = []

matches = [issue for issue in issues if isinstance(issue, dict) and issue.get("identifier") == issue_id]
if len(matches) != 1:
    sys.exit(3)

print(matches[0].get("status", ""))
' "$issue_id"
}

cleanup_worktrees() {
  local root worktrees_dir entry branch issue_id status
  root="$(repo_root)"
  worktrees_dir="$root/.paperclip/worktrees"
  [[ -d "$worktrees_dir" ]] || return 0

  for entry in "$worktrees_dir"/*; do
    [[ -d "$entry" ]] || continue
    [[ "$(basename "$entry")" != ".hook-state" ]] || continue

    if ! branch="$(git -C "$entry" rev-parse --abbrev-ref HEAD 2>/dev/null)"; then
      printf 'skip %s: not a readable git worktree\n' "$entry" >&2
      continue
    fi

    if ! issue_id="$(issue_from_branch "$branch")"; then
      printf 'skip %s: branch %s does not embed an ANKA issue id\n' "$entry" "$branch" >&2
      continue
    fi

    if ! status="$(lookup_issue_status "$issue_id")"; then
      printf 'skip %s: Paperclip issue lookup was unavailable or ambiguous\n' "$entry" >&2
      continue
    fi

    case "$status" in
      done|cancelled)
        if [[ -n "$(git -C "$entry" status --porcelain)" ]]; then
          printf 'skip %s: dirty\n' "$entry" >&2
          continue
        fi
        git -C "$root" worktree remove "$entry"
        ;;
      *)
        printf 'skip %s: issue %s status is %s\n' "$entry" "$issue_id" "$status" >&2
        ;;
    esac
  done
}

main() {
  local subcommand="${1:-}"
  case "$subcommand" in
    start)
      shift
      start_worktree "$@"
      ;;
    finish)
      shift
      finish_worktree "$@"
      ;;
    cleanup)
      shift
      [[ $# -eq 0 ]] || die "cleanup does not accept arguments"
      cleanup_worktrees
      ;;
    -h|--help|"")
      usage
      [[ -n "$subcommand" ]] || exit 1
      ;;
    *)
      usage
      die "unknown subcommand: $subcommand"
      ;;
  esac
}

main "$@"
