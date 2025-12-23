Branch protection recommendations

The repository should enforce the following branch protection rules for main (and any other protected branches):

Required protections

1) Require pull request reviews before merging
   - Require at least 1 approving review before merge. Consider 2 approvers for high-risk or release branches.
2) Require status checks to pass before merging
   - Include CI checks: ci/test, ci/lint, ci/build (configure names to match your CI provider).
3) Block force pushes
   - Prevent accidental history rewrites on protected branches.
4) Restrict who can push to the branch
   - Limit direct pushes to a small group (repo admins, CI service, Ship agent account if configured). Require merges via PR.
5) Enforce signed commits (optional)
   - If desired for security, require signed commits; note this may complicate automated agent commits.

Suggested workflow enforcement

- Enforce a merge strategy: prefer "Squash and merge" for feature PRs to keep main concise. Document exceptions when preserving commit history is required.
- Require that PR title contains bd-<id> for traceability (enforceable via a CI check or GitHub Action). Suggested status check name: `pr/validate-title` (see wf-79y.14).
- Use branch protection to block merges that do not have an updated bd note or failing CI.

How to apply

- Repo admins should configure these rules in the repository settings (GitHub -> Settings -> Branches -> Branch protection rules) or via infrastructure-as-code (Terraform, GitHub API).

Example: GitHub API payload

(Example payload for administrators — adjust required_checks to match CI job names)

{
  "name": "main",
  "protection": {
    "required_status_checks": {
      "strict": true,
      "contexts": ["ci/test", "ci/lint", "ci/build"]
    },
    "enforce_admins": true,
    "required_pull_request_reviews": {
      "required_approving_review_count": 1
    },
    "restrictions": null,
    "allow_force_pushes": false
  }
}

Notes

- Applying restrictions requires repository admin permissions. Coordinate with the org admins when implementing.
