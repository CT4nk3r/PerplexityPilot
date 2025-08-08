# Save this as project-info.ps1 and run in your project root folder

# Print directory tree (up to 3 levels deep), excluding node_modules
Write-Host "`nProject directory tree structure (up to 3 levels, excluding node_modules):`n"

Get-ChildItem -Recurse -Depth 3 | 
  Where-Object { $_.FullName -notmatch '\\node_modules(\\|$)' } | 
  ForEach-Object {
    $relativePath = $_.FullName.Substring((Get-Location).Path.Length)
    Write-Host $relativePath
  }

# Show first 20 lines of package.json if present
if (Test-Path package.json) {
  Write-Host "`npackage.json contents (first 20 lines):"
  Get-Content package.json -TotalCount 20 | ForEach-Object { Write-Host $_ }
} else {
  Write-Host "`npackage.json not found."
}

# List dependencies and devDependencies from package.json if possible
if (Test-Path package.json) {
  try {
    $package = Get-Content package.json -Raw | ConvertFrom-Json
    Write-Host "`nDependencies:"
    if ($package.dependencies) {
      $package.dependencies.GetEnumerator() | ForEach-Object { Write-Host "$($_.Name): $($_.Value)" }
    } else {
      Write-Host "No dependencies found."
    }
    Write-Host "`nDevDependencies:"
    if ($package.devDependencies) {
      $package.devDependencies.GetEnumerator() | ForEach-Object { Write-Host "$($_.Name): $($_.Value)" }
    } else {
      Write-Host "No devDependencies found."
    }
  } catch {
    Write-Host "Error parsing package.json for dependencies."
  }
}

# Check for lock files
if (Test-Path package-lock.json) {
  Write-Host "`npackage-lock.json found."
} elseif (Test-Path yarn.lock) {
  Write-Host "`nyarn.lock found."
} else {
  Write-Host "`nNo npm/yarn lock files found."
}

# Check common config files
Write-Host "`nChecking for common config files:"
foreach ($cfg in @("tsconfig.json", ".eslintrc.json", ".vscode\settings.json", "README.md")) {
  if (Test-Path $cfg) {
    Write-Host "${cfg}: FOUND"
  } else {
    Write-Host "${cfg}: Not found"
  }
}
