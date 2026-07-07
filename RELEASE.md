# Release Process

## Steps to Release a New Version

**1. Make sure all changes are committed and pushed to `main`**
```bash
git status   # should be clean
```

**2. Decide the version bump type**
- `patch` — bug fixes (0.1.1 → 0.1.2)
- `minor` — new features (0.1.1 → 0.2.0)
- `major` — breaking changes (0.1.1 → 1.0.0)

**3. Run the release script**
```bash
npm run release -- patch
# replace "patch" with "minor" or "major" as needed
```
This bumps the version in `package.json`/`package-lock.json`, commits with
`chore: bump version to X.Y.Z`, and creates the annotated tag `vX.Y.Z` — all
locally. It aborts if the working tree isn't clean or you're not on `main`.

**4. Push the commit and the tag**

The script prints the exact commands, e.g.:
```bash
git push origin main
git push origin v0.1.2
```

GitHub Actions will automatically build the app and create a GitHub Release with `scxml-editor-v0.1.2.zip` attached.
Check progress at your repo's **Actions** tab (~1 min).
