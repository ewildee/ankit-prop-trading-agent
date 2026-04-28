#!/bin/sh

set -u

script_dir=${0%/*}
if [ "$script_dir" = "$0" ]; then
  script_dir=.
fi

hook_dir=$(cd "$script_dir" 2>/dev/null && pwd -P)
if [ -z "$hook_dir" ]; then
  exit 0
fi

repo_root=$(cd "$hook_dir/.." 2>/dev/null && pwd -P)
if [ -z "$repo_root" ]; then
  exit 0
fi

git_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$git_root" ]; then
  exit 0
fi

git_root_abs=$(cd "$git_root" 2>/dev/null && pwd -P)
if [ "$git_root_abs" != "$repo_root" ]; then
  exit 0
fi

git config core.hooksPath .githooks
