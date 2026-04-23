---
name: review-artifact-policy
description: Standardizes how temporary review/debug artifacts are handled so they do not clutter the repository.
---

# Review Artifact Policy

## Purpose
Use this skill whenever review/debug tooling generates temporary files (for example `diff.txt`, `review_diff.txt`, ad-hoc logs, scratch outputs).

The goal is to keep repository root clean and prevent accidental commits of non-project artifacts.

## Policy
- Store temporary review/debug artifacts only in ignored folders.
- Preferred destinations: `.dev-logs/` and `tmp/review-artifacts/`.
- Do not store temporary artifacts at repository root.
- This includes shell-generated scratch files such as `diff_files.txt`, `domain_diff.txt`, `features_diff.txt`, `review_diff.txt`, ad hoc exported logs, and one-off comparison reports.
- Before creating a temporary artifact, verify the destination folder is ignored; if not, redirect it before writing the file.
- Do not delete by default; move files so work remains recoverable.

## Verification Steps
1. Check `git status --short` for unexpected untracked root files.
2. Confirm `.gitignore` covers the destination folder.
3. Move artifacts into ignored destination.
4. Re-run `git status --short` and confirm root clutter is gone.

## PowerShell Example
```powershell
if (-not (Test-Path tmp/review-artifacts)) {
  New-Item -ItemType Directory -Path tmp/review-artifacts | Out-Null
}

if (Test-Path diff.txt) {
  Move-Item diff.txt tmp/review-artifacts/diff.txt -Force
}

if (Test-Path review_diff.txt) {
  Move-Item review_diff.txt tmp/review-artifacts/review_diff.txt -Force
}

git status --short
```

## Expected Outcome
- Root stays focused on project assets only.
- Temporary artifacts remain available locally.
- Fewer accidental commits and cleaner reviews.
