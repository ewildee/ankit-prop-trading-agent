# Commit Footer Check Workflow

`commit-footer-check.yml` is the GitHub-side companion to the repo-local
`.githooks/commit-msg` hook. Local hooks do not run for GitHub PR merge,
squash, rebase, merge queue, or web-authored commits, so this workflow
guards the server-side path before changes land on `main`.

## Events

- `pull_request` (`opened`, `synchronize`, `reopened`) checks
  `${{ github.event.pull_request.base.sha }}..${{ github.event.pull_request.head.sha }}`.
- `push` to `main` checks `${{ github.event.before }}..${{ github.sha }}`.
  Initial pushes with an all-zero `before` SHA and tag-only pushes skip
  cleanly.
- `merge_group` checks
  `${{ github.event.merge_group.base_sha }}..${{ github.event.merge_group.head_sha }}`.

The checkout uses `fetch-depth: 0` so those ranges resolve against full
history and `persist-credentials: false` because the job only needs
read-only checkout state before running PR-controlled repository scripts.

## Required Trailer

Every non-exempt commit in the computed range must include this exact
case-sensitive trailer line:

```text
Co-Authored-By: Paperclip <noreply@paperclip.ing>
```

The checker extracts trailers with `git interpret-trailers --parse`, then
compares the parsed lines case-sensitively. A non-canonical casing such as
`Co-authored-by: Paperclip <noreply@paperclip.ing>` fails explicitly and
the workflow prints that observed line. A commit with no Paperclip trailer
fails with `<missing>`.

## Exceptions

The exception list is intentionally hard-coded and fail-closed:

- a commit whose subject starts with `Merge pull request #` and whose
  commit has merge topology (`parent_count >= 2`)

The GitHub merge-commit exception is evaluated per commit, so a normal
push-to-`main` merge range can contain clean PR commits plus a trailer-less
GitHub merge commit without false-failing. A one-parent commit that spoofs
the GitHub merge subject is still checked for the Paperclip trailer and
fails closed.

Bot-looking author names or emails are not exempt because normal commits
can forge that metadata. Automation commits must include the canonical
Paperclip trailer unless a future policy can prove a non-forgeable actor.

## Implementation

The workflow uses `actions/checkout@v4`, `bash`, and `git` only. It does
not install Bun, Node, or package-manager dependencies. The reusable
checker lives at `scripts/commit-footer-check.sh`, and
`__tests__/commit-footer-check.sh` builds temporary git repositories to
cover passing exact trailers, lowercase trailers, missing trailers,
multi-commit first-offender reporting, clean multi-commit ranges, bot
author forgery rejection, the per-commit GitHub merge exception in both
single-commit and normal push-merge ranges, a one-parent spoofed GitHub
merge-subject regression, and a static checkout credential-hardening
assertion.
