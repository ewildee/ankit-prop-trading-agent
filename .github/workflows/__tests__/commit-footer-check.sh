#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
readonly CHECK_SCRIPT="$SCRIPT_DIR/../scripts/commit-footer-check.sh"
readonly WORKFLOW_FILE="$SCRIPT_DIR/../commit-footer-check.yml"
readonly REQUIRED_TRAILER='Co-Authored-By: Paperclip <noreply@paperclip.ing>'

test_count=0

fail() {
  printf 'not ok %s - %s\n' "$test_count" "$1" >&2
  exit 1
}

assert_contains() {
  local haystack=$1
  local needle=$2

  if [[ "$haystack" != *"$needle"* ]]; then
    fail "expected output to contain: $needle"
  fi
}

new_repo() {
  local repo

  repo=$(mktemp -d)
  git -C "$repo" init -q
  git -C "$repo" config user.name 'CodexExecutor'
  git -C "$repo" config user.email 'codexexecutor@example.invalid'
  printf '%s\n' "$repo"
}

commit_message() {
  local repo=$1
  local subject=$2
  local body=${3:-}
  local author_name=${4:-CodexExecutor}
  local author_email=${5:-codexexecutor@example.invalid}
  local message_file

  message_file=$(mktemp)
  {
    printf '%s\n' "$subject"
    if [ -n "$body" ]; then
      printf '\n%s\n' "$body"
    fi
  } >"$message_file"

  GIT_AUTHOR_NAME="$author_name" \
    GIT_AUTHOR_EMAIL="$author_email" \
    GIT_COMMITTER_NAME="$author_name" \
    GIT_COMMITTER_EMAIL="$author_email" \
    git -C "$repo" commit --allow-empty -q -F "$message_file"

  rm -f "$message_file"
  git -C "$repo" rev-parse HEAD
}

run_check() {
  local repo=$1
  local range=$2
  local output
  local status

  set +e
  output=$(cd "$repo" && "$CHECK_SCRIPT" "$range" 2>&1)
  status=$?
  set -e

  printf '%s\n%s\n' "$status" "$output"
}

run_test() {
  local name=$1
  shift

  test_count=$((test_count + 1))
  "$@" || fail "$name"
  printf 'ok %s - %s\n' "$test_count" "$name"
}

passes_with_exact_trailer() {
  local repo base head result status

  repo=$(new_repo)
  base=$(commit_message "$repo" 'chore: base' "$REQUIRED_TRAILER")
  head=$(commit_message "$repo" 'docs: clean commit' "$REQUIRED_TRAILER")
  result=$(run_check "$repo" "$base..$head")
  status=$(printf '%s\n' "$result" | sed -n '1p')

  [ "$status" = "0" ]
}

fails_with_lowercase_trailer() {
  local repo base head result status output

  repo=$(new_repo)
  base=$(commit_message "$repo" 'chore: base' "$REQUIRED_TRAILER")
  head=$(commit_message "$repo" 'docs: bad lowercase' 'Co-authored-by: Paperclip <noreply@paperclip.ing>')
  result=$(run_check "$repo" "$base..$head")
  status=$(printf '%s\n' "$result" | sed -n '1p')
  output=$(printf '%s\n' "$result" | sed '1d')

  [ "$status" != "0" ] || return 1
  assert_contains "$output" "$head"
  assert_contains "$output" 'Co-authored-by: Paperclip <noreply@paperclip.ing>'
}

fails_with_missing_trailer() {
  local repo base head result status output

  repo=$(new_repo)
  base=$(commit_message "$repo" 'chore: base' "$REQUIRED_TRAILER")
  head=$(commit_message "$repo" 'docs: missing trailer')
  result=$(run_check "$repo" "$base..$head")
  status=$(printf '%s\n' "$result" | sed -n '1p')
  output=$(printf '%s\n' "$result" | sed '1d')

  [ "$status" != "0" ] || return 1
  assert_contains "$output" "$head"
  assert_contains "$output" '<missing>'
}

fails_first_offending_commit_in_multi_commit_range() {
  local repo base bad good result status output

  repo=$(new_repo)
  base=$(commit_message "$repo" 'chore: base' "$REQUIRED_TRAILER")
  bad=$(commit_message "$repo" 'docs: first bad')
  good=$(commit_message "$repo" 'docs: later good' "$REQUIRED_TRAILER")
  result=$(run_check "$repo" "$base..$good")
  status=$(printf '%s\n' "$result" | sed -n '1p')
  output=$(printf '%s\n' "$result" | sed '1d')

  [ "$status" != "0" ] || return 1
  assert_contains "$output" "$bad"
}

passes_clean_multi_commit_range() {
  local repo base head result status

  repo=$(new_repo)
  base=$(commit_message "$repo" 'chore: base' "$REQUIRED_TRAILER")
  commit_message "$repo" 'docs: clean one' "$REQUIRED_TRAILER" >/dev/null
  head=$(commit_message "$repo" 'docs: clean two' "$REQUIRED_TRAILER")
  result=$(run_check "$repo" "$base..$head")
  status=$(printf '%s\n' "$result" | sed -n '1p')

  [ "$status" = "0" ]
}

fails_forged_bot_author_without_trailer() {
  local repo base head result status output

  repo=$(new_repo)
  base=$(commit_message "$repo" 'chore: base' "$REQUIRED_TRAILER")
  head=$(commit_message "$repo" 'chore: automated bump' '' 'dependabot[bot]' '49699333+dependabot[bot]@users.noreply.github.com')
  result=$(run_check "$repo" "$base..$head")
  status=$(printf '%s\n' "$result" | sed -n '1p')
  output=$(printf '%s\n' "$result" | sed '1d')

  [ "$status" != "0" ] || return 1
  assert_contains "$output" "$head"
  assert_contains "$output" '<missing>'
}

merge_commit_message() {
  local repo=$1
  local first_parent=$2
  local second_parent=$3
  local subject=$4

  git -C "$repo" commit-tree "$first_parent^{tree}" -p "$first_parent" -p "$second_parent" -m "$subject"
}

skips_single_github_merge_commit() {
  local repo initial_branch base side merged_base head result status

  repo=$(new_repo)
  base=$(commit_message "$repo" 'chore: base' "$REQUIRED_TRAILER")
  initial_branch=$(git -C "$repo" rev-parse --abbrev-ref HEAD)
  git -C "$repo" switch -q -c feature "$base"
  side=$(commit_message "$repo" 'docs: feature branch' "$REQUIRED_TRAILER")
  git -C "$repo" switch -q "$initial_branch"
  git -C "$repo" merge -q --no-ff "$side" -m 'Merge feature branch'
  merged_base=$(git -C "$repo" rev-parse HEAD)
  head=$(merge_commit_message "$repo" "$merged_base" "$side" 'Merge pull request #123 from ewildee/example')
  git -C "$repo" update-ref refs/heads/main "$head"
  result=$(run_check "$repo" "$merged_base..$head")
  status=$(printf '%s\n' "$result" | sed -n '1p')

  [ "$status" = "0" ]
}

passes_normal_push_merge_range() {
  local repo initial_branch base feature head result status

  repo=$(new_repo)
  base=$(commit_message "$repo" 'chore: base' "$REQUIRED_TRAILER")
  initial_branch=$(git -C "$repo" rev-parse --abbrev-ref HEAD)
  git -C "$repo" switch -q -c feature "$base"
  feature=$(commit_message "$repo" 'docs: feature branch' "$REQUIRED_TRAILER")
  git -C "$repo" switch -q "$initial_branch"
  head=$(merge_commit_message "$repo" "$base" "$feature" 'Merge pull request #123 from ewildee/example')
  git -C "$repo" update-ref refs/heads/main "$head"
  result=$(run_check "$repo" "$base..$head")
  status=$(printf '%s\n' "$result" | sed -n '1p')

  [ "$status" = "0" ]
}

fails_spoofed_github_merge_subject_without_merge_topology() {
  local repo base head result status output

  repo=$(new_repo)
  base=$(commit_message "$repo" 'chore: base' "$REQUIRED_TRAILER")
  head=$(commit_message "$repo" 'Merge pull request #999 from attacker/no-footer')
  result=$(run_check "$repo" "$base..$head")
  status=$(printf '%s\n' "$result" | sed -n '1p')
  output=$(printf '%s\n' "$result" | sed '1d')

  [ "$status" != "0" ] || return 1
  assert_contains "$output" "$head"
  assert_contains "$output" '<missing>'
}

checkout_does_not_persist_credentials() {
  grep -Eq '^[[:space:]]+persist-credentials:[[:space:]]+false[[:space:]]*$' "$WORKFLOW_FILE"
}

run_test 'passes with exact Paperclip trailer' passes_with_exact_trailer
run_test 'fails with lowercase Paperclip trailer and reports observed line' fails_with_lowercase_trailer
run_test 'fails with missing Paperclip trailer and reports <missing>' fails_with_missing_trailer
run_test 'fails first offending commit in multi-commit range' fails_first_offending_commit_in_multi_commit_range
run_test 'passes a clean multi-commit range' passes_clean_multi_commit_range
run_test 'fails forged bot-authored commits without Paperclip trailer' fails_forged_bot_author_without_trailer
run_test 'skips a single real GitHub merge commit' skips_single_github_merge_commit
run_test 'passes a normal push-merge range with clean PR commits and a trailer-less GitHub merge commit' passes_normal_push_merge_range
run_test 'fails spoofed GitHub merge subject without merge topology' fails_spoofed_github_merge_subject_without_merge_topology
run_test 'checkout does not persist credentials' checkout_does_not_persist_credentials
