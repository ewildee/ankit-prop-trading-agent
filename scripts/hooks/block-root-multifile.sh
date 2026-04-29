#!/usr/bin/env bash
set -euo pipefail

BLOCK_REASON='Refusing second modifying tool call in the shared root checkout during a Paperclip heartbeat. The shared root is not safe for multi-file edits — concurrent heartbeats will silently wipe uncommitted changes (see ANKA-31 / ANKA-98 / ANKA-126). Move this work into a per-issue worktree:

  scripts/paperclip-worktree.sh start <issueId>

Then run your edits inside `.paperclip/worktrees/<issueId>`. Board users who really do mean to hand-edit the shared root can `export ANKA_ALLOW_ROOT_MULTIFILE=1` for this session.'

log_internal_error() {
  printf 'block-root-multifile hook internal error: %s\n' "$*" >&2
}

find_shared_root() {
  local dir="$1"
  while [[ "$dir" != "/" && -n "$dir" ]]; do
    if [[ -f "$dir/AGENTS.md" && -d "$dir/.git" ]]; then
      printf '%s\n' "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  return 1
}

json_deny() {
  BLOCK_REASON="$BLOCK_REASON" python3 -c '
import json
import os

print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": os.environ["BLOCK_REASON"],
    }
}, ensure_ascii=False, separators=(",", ":")))
'
}

read_count() {
  local count_file="$1"
  local value="0"
  if [[ -f "$count_file" ]]; then
    IFS= read -r value < "$count_file" || value="0"
  fi
  case "$value" in
    ""|*[!0-9]*)
      value="0"
      ;;
  esac
  printf '%s\n' "$value"
}

increment_count_with_mkdir_lock() {
  local count_file="$1"
  local lock_dir="$count_file.lockdir"
  local current next acquired="0"

  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if mkdir "$lock_dir" 2>/dev/null; then
      acquired="1"
      break
    fi
    sleep 0.05
  done

  [[ "$acquired" == "1" ]] || return 1

  current="$(read_count "$count_file")"
  next=$((current + 1))
  printf '%s\n' "$next" > "$count_file.tmp.$$"
  mv "$count_file.tmp.$$" "$count_file"
  printf '%s\n' "$next"
  rmdir "$lock_dir" 2>/dev/null || true
}

increment_count() {
  local count_file="$1"
  local lock_file="$count_file.lock"
  local current next

  if command -v flock >/dev/null 2>&1; then
    (
      flock -x 9
      current="$(read_count "$count_file")"
      next=$((current + 1))
      printf '%s\n' "$next" > "$count_file.tmp.$$"
      mv "$count_file.tmp.$$" "$count_file"
      printf '%s\n' "$next"
    ) 9>"$lock_file"
  else
    increment_count_with_mkdir_lock "$count_file"
  fi
}

run_hook() {
  [[ "${ANKA_ALLOW_ROOT_MULTIFILE:-}" == "1" ]] && return 0
  [[ -n "${PAPERCLIP_TASK_ID:-}" ]] || return 0

  local cwd current_root shared_root
  cwd="$(pwd -P)"

  if ! current_root="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)"; then
    return 0
  fi

  if ! shared_root="$(find_shared_root "$cwd")"; then
    return 0
  fi

  [[ "$current_root" == "$shared_root" ]] || return 0

  local state_dir run_id count_file next_count
  state_dir="$shared_root/.paperclip/.hook-state"
  run_id="${PAPERCLIP_RUN_ID:-pid-$$}"
  count_file="$state_dir/$run_id.count"

  mkdir -p "$state_dir" || return 1
  if ! next_count="$(increment_count "$count_file")"; then
    return 1
  fi

  if (( next_count <= 1 )); then
    return 0
  fi

  json_deny
  return 2
}

status=0
run_hook || status=$?

case "$status" in
  0)
    exit 0
    ;;
  2)
    exit 2
    ;;
  *)
    log_internal_error "allowing tool call because the guard failed open"
    exit 0
    ;;
esac
