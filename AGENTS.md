# Advanced History development workflow

## Local development builds

- After completing and validating any change to the integration or its frontend, run `python3 scripts/build_dev.py` as the final step.
- Do not wait for the user to request or approve the build-number increment.
- Run the builder only after all code changes and tests are complete so the ZIP contains the final files.
- Include the updated tracked `dev-build.json` counter in the corresponding development commit.
- Report the generated display version and ZIP path in the final response.
- Do not increment the build number for documentation-only, repository-metadata-only, or test-only changes.
- Development testing is local and does not depend on a commit, push, or GitHub Actions.
