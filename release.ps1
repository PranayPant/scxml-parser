param(
    [string]$BumpType
)

$ErrorActionPreference = "Stop"

$validTypes = @("patch", "minor", "major")
if (-not $BumpType -or $validTypes -notcontains $BumpType) {
    Write-Host "Usage: npm run release -- <patch|minor|major>" -ForegroundColor Yellow
    exit 1
}

# Working tree must be clean
$status = git status --porcelain
if ($status) {
    Write-Error "Working tree is not clean. Commit or stash your changes before releasing."
    exit 1
}

# Must be on main
$branch = git rev-parse --abbrev-ref HEAD
if ($branch -ne "main") {
    Write-Error "You must be on 'main' to release (currently on '$branch')."
    exit 1
}

# Bump version in package.json / package-lock.json
npm version $BumpType --no-git-tag-version
if ($LASTEXITCODE -ne 0) {
    Write-Error "npm version failed."
    exit 1
}

$version = (Get-Content package.json | ConvertFrom-Json).version
$tag = "v$version"

# Commit the bump
git add package.json package-lock.json
git commit -m "chore: bump version to $version"

# Tag the release
git tag -a $tag -m "Release $tag"

Write-Host ""
Write-Host "Version bumped to $version and tagged as $tag locally." -ForegroundColor Green
Write-Host "Review the commit, then push when ready:"
Write-Host ""
Write-Host "  git push origin main"
Write-Host "  git push origin $tag"
Write-Host ""
