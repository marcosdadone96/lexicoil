# Setup offline German POS caps checker (.venv-pos-check + spaCy de_core_news_sm)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Venv = Join-Path $Root ".venv-pos-check"
$Py = Join-Path $Venv "Scripts\python.exe"

Write-Host "Creating venv at $Venv ..."
python -m venv $Venv

Write-Host "Installing spacy ..."
& $Py -m pip install --upgrade pip spacy click
& $Py -m pip install "https://github.com/explosion/spacy-models/releases/download/de_core_news_sm-3.8.0/de_core_news_sm-3.8.0-py3-none-any.whl"

Write-Host ""
Write-Host "POS checker ready."
Write-Host "  Activate:  .\.venv-pos-check\Scripts\Activate.ps1"
Write-Host "  Or set:    `$env:POS_CHECK_PYTHON = '$Py'"
Write-Host ""
Write-Host "Verify:"
Write-Host "  & '$Py' scripts/pos-caps-check.py"
Write-Host "  node scripts/calibrate-german-caps-gate.mjs"
