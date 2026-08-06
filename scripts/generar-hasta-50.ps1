#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Llena el pool de un módulo/teil hasta un objetivo, rotando vocabulario via cobertura.

.EXAMPLE
  .\scripts\generar-hasta-50.ps1 -Target 50 -RefreshEvery 10
  .\scripts\generar-hasta-50.ps1 -Level A2 -Module lesen -Teile 1,2,3,4 -DryRun
  .\scripts\generar-hasta-50.ps1 -Target 50 -DryRun
#>
[CmdletBinding()]
param(
  [ValidateSet('A2', 'B1', 'B2', 'C1')]
  [string]$Level = 'B1',
  [ValidateSet('lesen', 'horen', 'schreiben', 'sprechen')]
  [string]$Module = 'lesen',
  [int]$Target = 50,
  [int]$RefreshEvery = 10,
  [string]$Provider = 'gemini',
  [int]$FixRetries = 5,
  [string]$Teile = '',
  [int]$WordCount = 5,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$env:NODE_OPTIONS = '--use-system-ca'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$Lang = 'de'
$Level = $Level.ToUpperInvariant()
$WeakFile = Join-Path $RepoRoot "data/coverage/weak-${Lang}_${Level}.json"

function Get-ExamLayout {
  $raw = node -e @"
import { layoutForLevel, hasExplicitAssembleLayout } from './scripts/lib/examLevelCells.mjs';
const lv = '$Level';
const l = layoutForLevel(lv);
console.log(JSON.stringify({
  explicit: hasExplicitAssembleLayout(lv),
  lesen: l.lesen,
  horen: l.horen,
  schreiben: l.schreibenTeils,
  sprechen: l.sprechenTeils,
}));
"@ 2>&1
  if ($LASTEXITCODE -ne 0) { throw "No se pudo leer layout para $Level : $raw" }
  return $raw | ConvertFrom-Json
}

$Layout = Get-ExamLayout
$MaxLesenTeil = ($Layout.lesen | Measure-Object -Maximum).Maximum
$MaxHorenTeil = ($Layout.horen | Measure-Object -Maximum).Maximum

if (-not $Teile) {
  if ($Module -eq 'lesen') {
    $Teile = ($Layout.lesen -join ',')
  }
  elseif ($Module -eq 'horen') {
    $Teile = ($Layout.horen -join ',')
  }
  else {
    $Teile = ''
  }
}

$TeilList = @(
  $Teile -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^\d+$' } | ForEach-Object { [int]$_ } | Where-Object { $_ -ge 1 }
)
if ($Module -eq 'lesen') {
  $TeilList = @($TeilList | Where-Object { $_ -le $MaxLesenTeil })
}
elseif ($Module -eq 'horen') {
  $TeilList = @($TeilList | Where-Object { $_ -le $MaxHorenTeil })
}
else {
  $TeilList = @($null)
}
if (-not $TeilList.Count) {
  Write-Error "Teile invalido para $Module/$Level : '$Teile' (layout lesen max=$MaxLesenTeil horen max=$MaxHorenTeil)"
}

function Get-StatKey {
  param($Teil)
  if ($null -eq $Teil) { return $Module }
  return $Teil
}

$stats = @{}
foreach ($t in $TeilList) {
  $key = Get-StatKey $t
  $stats[$key] = [ordered]@{
    Generadas   = 0
    Descartadas = 0
    PoolInicio  = 0
    PoolFinal   = 0
  }
}

function Write-Cmd {
  param([string]$Line)
  if ($DryRun) { Write-Host "[dry-run] $Line" -ForegroundColor DarkCyan }
  else { Write-Host ">> $Line" -ForegroundColor Cyan }
}

function Invoke-NodeCmd {
  param(
    [Parameter(Mandatory)][string[]]$Args,
    [switch]$AllowFail
  )
  $display = 'node ' + ($Args -join ' ')
  Write-Cmd $display
  if ($DryRun) {
    return @{ ExitCode = 0; Output = '' }
  }
  $output = & node @Args 2>&1 | Out-String
  $code = $LASTEXITCODE
  if ($output.Trim()) { Write-Host $output }
  if ($code -ne 0 -and -not $AllowFail) {
    throw "Comando fallo (exit $code): $display"
  }
  return @{ ExitCode = $code; Output = $output }
}

function Get-MockPoolCounts {
  $map = @{}
  foreach ($t in $TeilList) { $map[$t] = [Math]::Max(0, $Target - 12) }
  return $map
}

function Parse-LesenPoolCounts {
  param([string]$Output)
  $map = @{}
  foreach ($line in ($Output -split "`r?`n")) {
    if ($line -match '^\s*lesen:T(\d+)\s+(\d+)\s*$') {
      $map[[int]$Matches[1]] = [int]$Matches[2]
    }
  }
  return $map
}

function Parse-Cov0 {
  param([string]$Output)
  if ($Output -match '0 partes \(sin cubrir\):\s+(\d+)') {
    return [int]$Matches[1]
  }
  return $null
}

function Get-PoolCounts {
  if ($DryRun) {
    return @{
      Counts = Get-MockPoolCounts
      Cov0   = 420
      Output = ''
    }
  }
  $res = Invoke-NodeCmd @(
    'scripts/vocab-coverage-report.mjs',
    '--lang', $Lang,
    '--level', $Level,
    '--source', 'blobs'
  )
  return @{
    Counts = Parse-LesenPoolCounts $res.Output
    Cov0   = Parse-Cov0 $res.Output
    Output = $res.Output
  }
}

function Get-WeakWords {
  param([int]$Count = 8)
  if (-not (Test-Path $WeakFile)) {
    throw "No existe $WeakFile - ejecuta vocab-coverage-report primero."
  }
  $data = Get-Content $WeakFile -Raw | ConvertFrom-Json
  $lemmas = @($data.weakLemmas)
  if (-not $lemmas.Count) {
    throw "Lista weakLemmas vacia en $WeakFile"
  }
  $n = [Math]::Min($Count, $lemmas.Count)
  $picked = @($lemmas | Get-Random -Count $n)
  return ($picked -join ',')
}

function Parse-GenerateWave {
  param([string]$Output, [int]$Teil)
  $gen = 0
  $disc = 0
  $pat = "T${Teil}: (\d+) guardadas, (\d+) descartadas"
  if ($Output -match $pat) {
    $gen = [int]$Matches[1]
    $disc = [int]$Matches[2]
  }
  elseif ($Output -match 'Partes guardadas \(formato \+ calidad OK\): (\d+)') {
    $gen = [int]$Matches[1]
  }
  return @{ Generadas = $gen; Descartadas = $disc }
}

function Parse-MakeCount {
  param([string]$Output)
  if ($Output -match 'Generadas (\d+) parte') {
    return [int]$Matches[1]
  }
  return 0
}

function Get-ReusablePoolCounts {
  $seedFile = Join-Path $RepoRoot "library/reusable-seed/${Lang}_${Level}.json"
  $map = @{}
  foreach ($t in $TeilList) {
    if ($null -eq $t) {
      $map[$Module] = 0
    }
    else {
      $map[$t] = 0
    }
  }
  if ($DryRun -or -not (Test-Path $seedFile)) { return $map }
  try {
    $data = Get-Content $seedFile -Raw | ConvertFrom-Json
    foreach ($rec in @($data.records)) {
      if ($rec.module -ne $Module) { continue }
      if ($Module -eq 'schreiben' -or $Module -eq 'sprechen') {
        $map[$Module] = [int]$map[$Module] + 1
      }
      elseif ($map.ContainsKey([int]$rec.teil)) {
        $map[[int]$rec.teil] = [int]$map[[int]$rec.teil] + 1
      }
    }
  }
  catch {
    Write-Warning "No se pudo leer pool reusable: $seedFile"
  }
  return $map
}

function Parse-GenerateWaveExam {
  param([string]$Output, [string]$Key)
  $gen = 0
  $disc = 0
  if ($Output -match "${Key}: (\d+) guardadas, (\d+) descartadas") {
    $gen = [int]$Matches[1]
    $disc = [int]$Matches[2]
  }
  elseif ($Output -match 'Partes guardadas \(formato \+ calidad OK\): (\d+)') {
    $gen = [int]$Matches[1]
  }
  return @{ Generadas = $gen; Descartadas = $disc }
}

function Publish-ExamModule {
  param([int]$Teil)
  $args = @(
    'scripts/publish-exam-generated.mjs',
    '--module', $Module,
    '--level', $Level,
    '--publish',
    '--sync-pool',
    '--allow-bank-dup',
    '--continue'
  )
  if ($Module -eq 'horen' -and $Teil -gt 0) {
    $args += @('--teil', "$Teil")
  }
  Invoke-NodeCmd $args | Out-Null
}

function Publish-LesenTeil {
  param([int]$Teil)
  Invoke-NodeCmd @(
    'scripts/publish-lesen-generated.mjs',
    '--teil', "$Teil",
    '--level', $Level,
    '--publish',
    '--sync-pool',
    '--allow-bank-dup'
  ) | Out-Null
}

function Invoke-GenerateWave {
  param([int]$Teil, [int]$BatchCount)

  if ($Module -eq 'lesen') {
    return Invoke-NodeCmd @(
      'scripts/generate-lesen-part-gemini.mjs',
      '--provider', $Provider,
      '--level', $Level,
      '--teil', "$Teil",
      '--count', "$BatchCount",
      '--from-coverage',
      '--fix-retries', "$FixRetries",
      '--word-count', "$WordCount"
    )
  }

  $cmd = @(
    'scripts/generate-part-gemini.mjs',
    '--module', $Module,
    '--provider', $Provider,
    '--level', $Level,
    '--count', "$BatchCount",
    '--from-coverage',
    '--fix-retries', "$FixRetries",
    '--word-count', "$WordCount"
  )
  if ($Module -eq 'horen') {
    $cmd += @('--teil', "$Teil")
  }
  return Invoke-NodeCmd $cmd
}

Write-Host ''
Write-Host '===============================================================' -ForegroundColor Yellow
Write-Host " generar-hasta-50 | $Module $Lang/$Level | objetivo $Target" -ForegroundColor Yellow
Write-Host " Layout explicit=$($Layout.explicit) | lesen=$($Layout.lesen -join ',') | schreiben=$($Layout.schreiben -join ',') | sprechen=$($Layout.sprechen -join ',')" -ForegroundColor Yellow
Write-Host " Provider=$Provider | RefreshEvery=$RefreshEvery | FixRetries=$FixRetries | WordCount=$WordCount" -ForegroundColor Yellow
Write-Host " Teile: $(if ($Module -eq 'schreiben' -or $Module -eq 'sprechen') { 'batch (1 tanda)' } else { ($TeilList -join ', ') })" -ForegroundColor Yellow
if ($DryRun) { Write-Host ' MODO DRY-RUN (solo muestra comandos)' -ForegroundColor Magenta }
Write-Host '===============================================================' -ForegroundColor Yellow
Write-Host ''

$cov0Before = '?'
$cov0After = '?'

if ($Module -eq 'lesen') {
  Write-Host '-- Cobertura inicial (pool Blobs) --' -ForegroundColor Green
  $initial = Get-PoolCounts
  $cov0Before = $initial.Cov0
  if ($null -eq $cov0Before) { $cov0Before = '?' }

  foreach ($t in $TeilList) {
    $actual = $initial.Counts[$t]
    if ($null -eq $actual) { $actual = 0 }
    $stats[$t].PoolInicio = $actual
    $faltan = [Math]::Max(0, $Target - $actual)
    Write-Host ('  T{0}: pool={1} | objetivo={2} | faltan={3}' -f $t, $actual, $Target, $faltan)
  }
  Write-Host ''
}
else {
  Write-Host '-- Pool inicial (reusable-seed) --' -ForegroundColor Green
  $initialExam = Get-ReusablePoolCounts
  foreach ($t in $TeilList) {
    $key = Get-StatKey $t
    $actual = $initialExam[$key]
    if ($null -eq $actual) { $actual = 0 }
    $stats[$key].PoolInicio = $actual
    $faltan = [Math]::Max(0, $Target - $actual)
    $label = if ($null -eq $t) { $Module } else { "T$t" }
    Write-Host ('  {0}: pool={1} | objetivo={2} | faltan={3}' -f $label, $actual, $Target, $faltan)
  }
  Write-Host ''
}

foreach ($t in $TeilList) {
  $statKey = Get-StatKey $t
  $label = if ($null -eq $t) { $Module } else { "T$t" }
  $summaryKey = if ($null -eq $t) { $Module } else { "T$t" }

  if ($Module -eq 'lesen') {
    $poolNow = $initial.Counts[$t]
  }
  else {
    $poolNow = $initialExam[$statKey]
  }
  if ($null -eq $poolNow) { $poolNow = 0 }
  $faltan = [Math]::Max(0, $Target - $poolNow)

  if ($faltan -le 0) {
    Write-Host ('-- {0}: ya en objetivo ({1}/{2}) - omitido --' -f $label, $poolNow, $Target) -ForegroundColor DarkGray
    $stats[$statKey].PoolFinal = $poolNow
    continue
  }

  Write-Host ('-- {0}: generando hasta {1} (faltan {2}) --' -f $label, $Target, $faltan) -ForegroundColor Green

  if ($Module -eq 'lesen' -and $Level -eq 'B1' -and ($t -eq 3 -or $t -eq 4)) {
    $makeScript = if ($t -eq 3) { 'scripts/make-t3.mjs' } else { 'scripts/make-t4.mjs' }
    try {
      $words = Get-WeakWords -Count 8
    }
    catch {
      if ($DryRun) { $words = 'lemma1,lemma2,lemma3,lemma4,lemma5,lemma6,lemma7,lemma8' }
      else { throw }
    }

    $res = Invoke-NodeCmd @(
      $makeScript,
      '--count', "$faltan",
      '--words', $words
    )
    $made = Parse-MakeCount $res.Output
    $stats[$statKey].Generadas += $made
    $stats[$statKey].Descartadas += [Math]::Max(0, $faltan - $made)

    if (-not $DryRun -and $made -le 0) {
      Write-Error ('T{0}: make-t{0} no genero ninguna parte valida.' -f $t)
    }

    Publish-LesenTeil -Teil $t

    if ($DryRun) {
      $stats[$statKey].PoolFinal = $Target
    }
    else {
      $refreshed = Get-PoolCounts
      $poolNow = $refreshed.Counts[$t]
      if ($null -eq $poolNow) { $poolNow = 0 }
      $stats[$statKey].PoolFinal = $poolNow
    }
    continue
  }

  while ($faltan -gt 0) {
    $batch = [Math]::Min($RefreshEvery, $faltan)
    Write-Host ('  {0} tanda: {1} (faltan {2})' -f $label, $batch, $faltan) -ForegroundColor White

    if ($DryRun) {
      Invoke-GenerateWave -Teil $(if ($null -eq $t) { 0 } else { $t }) -BatchCount $batch | Out-Null
      $stats[$statKey].Generadas += $batch
      if ($Module -eq 'lesen') {
        Publish-LesenTeil -Teil $t
        Invoke-NodeCmd @(
          'scripts/vocab-coverage-report.mjs',
          '--lang', $Lang,
          '--level', $Level,
          '--source', 'blobs'
        ) | Out-Null
      }
      else {
        Publish-ExamModule -Teil $(if ($null -eq $t) { 0 } else { $t })
      }
      $faltan = 0
      $stats[$statKey].PoolFinal = $Target
      break
    }

    $genRes = Invoke-GenerateWave -Teil $(if ($null -eq $t) { 0 } else { $t }) -BatchCount $batch

    if ($Module -eq 'lesen') {
      $wave = Parse-GenerateWave $genRes.Output $t
    }
    else {
      $wave = Parse-GenerateWaveExam $genRes.Output $summaryKey
    }
    $stats[$statKey].Generadas += $wave.Generadas
    $stats[$statKey].Descartadas += $wave.Descartadas

    if ($wave.Generadas -le 0) {
      Write-Error ('{0}: tanda sin partes guardadas (descartadas={1}).' -f $label, $wave.Descartadas)
    }

    if ($Module -eq 'lesen') {
      Publish-LesenTeil -Teil $t
      $refreshed = Get-PoolCounts
      $poolNow = $refreshed.Counts[$t]
    }
    else {
      Publish-ExamModule -Teil $(if ($null -eq $t) { 0 } else { $t })
      $refreshed = Get-ReusablePoolCounts
      $poolNow = $refreshed[$statKey]
    }
    if ($null -eq $poolNow) { $poolNow = 0 }
    $faltan = [Math]::Max(0, $Target - $poolNow)
    Write-Host ('  {0} tras tanda: pool={1} | faltan={2}' -f $label, $poolNow, $faltan)
  }

  $stats[$statKey].PoolFinal = $poolNow
}

Write-Host ''
if ($Module -eq 'lesen') {
  Write-Host '-- Cobertura final --' -ForegroundColor Green
  $final = Get-PoolCounts
  $cov0After = $final.Cov0
  if ($null -eq $cov0After) { $cov0After = '?' }

  foreach ($t in $TeilList) {
    if ($stats[$t].PoolFinal -eq 0 -and $final.Counts.ContainsKey($t)) {
      $stats[$t].PoolFinal = $final.Counts[$t]
    }
  }
}
else {
  Write-Host '-- Pool final (reusable-seed) --' -ForegroundColor Green
  $finalExam = Get-ReusablePoolCounts
  foreach ($t in $TeilList) {
    $key = Get-StatKey $t
    if ($stats[$key].PoolFinal -eq 0 -and $finalExam.ContainsKey($key)) {
      $stats[$key].PoolFinal = $finalExam[$key]
    }
  }
}

Write-Host ''
Write-Host '-- Resumen por parte --' -ForegroundColor Yellow
Write-Host ('{0,-10} {1,10} {2,12} {3,10} {4,10} {5,10}' -f 'Parte', 'Generadas', 'Descartadas', 'Pool ini', 'Pool fin', 'Objetivo')
Write-Host ('{0,-10} {1,10} {2,12} {3,10} {4,10} {5,10}' -f '--------', '---------', '-----------', '--------', '--------', '--------')
foreach ($t in $TeilList) {
  $key = Get-StatKey $t
  $label = if ($null -eq $t) { $Module } else { "T$t" }
  $s = $stats[$key]
  Write-Host ('{0,-10} {1,10} {2,12} {3,10} {4,10} {5,10}' -f $label, $s.Generadas, $s.Descartadas, $s.PoolInicio, $s.PoolFinal, $Target)
}

if ($Module -eq 'lesen') {
  Write-Host ''
  Write-Host '-- Cobertura vocabulario (lemas en 0 partes) --' -ForegroundColor Yellow
  Write-Host ('  Antes:   {0}' -f $cov0Before)
  Write-Host ('  Despues: {0}' -f $cov0After)
  if ($cov0Before -ne '?' -and $cov0After -ne '?') {
    $delta = [int]$cov0After - [int]$cov0Before
    $sign = if ($delta -le 0) { '' } else { '+' }
    Write-Host ('  Delta:   {0}{1}' -f $sign, $delta)
  }
}

Write-Host ''
Write-Host 'Listo.' -ForegroundColor Green
