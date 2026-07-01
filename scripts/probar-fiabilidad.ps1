#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Prueba fiabilidad de Gemini (sin publicar al pool) antes de generar en volumen.

.EXAMPLE
  .\scripts\probar-fiabilidad.ps1 -Sample 5
  .\scripts\probar-fiabilidad.ps1 -Sample 3 -Teile "1,2" -FixRetries 8
#>
[CmdletBinding()]
param(
  [ValidateSet('lesen', 'horen', 'schreiben', 'sprechen')]
  [string]$Module = 'lesen',
  [int]$Sample = 5,
  [string]$Teile = '1,2,5',
  [int]$FixRetries = 5,
  [int]$WordCount = 5
)

$ErrorActionPreference = 'Stop'
$env:NODE_OPTIONS = '--use-system-ca'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$TeilList = @(
  $Teile -split ',' | ForEach-Object { [int]$_.Trim() } | Where-Object { $_ -ge 1 }
)
if ($Module -eq 'lesen') {
  $TeilList = @($TeilList | Where-Object { $_ -le 5 })
  if (-not $TeilList.Count) { Write-Error "Teile invalido para lesen: '$Teile' (usa 1-5)" }
}
elseif ($Module -eq 'horen') {
  $TeilList = @($TeilList | Where-Object { $_ -le 4 })
  if (-not $TeilList.Count) { Write-Error "Teile invalido para horen: '$Teile' (usa 1-4)" }
}
else {
  # schreiben/sprechen: un batch = Teile 1-3; ignoramos lista y usamos una sola iteracion
  $TeilList = @($null)
}

function Parse-TeilSummary {
  param([string]$Output, [string]$Module, [int]$Teil)

  $guardadas = 0
  $descartadas = 0
  $intentos = 0

  if ($Module -eq 'schreiben' -or $Module -eq 'sprechen') {
    $pat = "${Module}: (\d+) guardadas, (\d+) descartadas, (\d+) intentos"
  }
  else {
    $pat = "T${Teil}: (\d+) guardadas, (\d+) descartadas, (\d+) intentos"
  }

  if ($Output -match $pat) {
    $guardadas = [int]$Matches[1]
    $descartadas = [int]$Matches[2]
    $intentos = [int]$Matches[3]
  }
  return @{
    Guardadas   = $guardadas
    Descartadas = $descartadas
    Intentos    = $intentos
  }
}

function Normalize-DiscardReason {
  param([string]$Line)
  $t = $Line.Trim()
  if (-not $t) { return $null }
  # Quita prefijo de id de pregunta: gen-q-1-abc-1: ...
  if ($t -match '^[\w-]+:\s*(.+)$') { $t = $Matches[1] }
  return $t
}

function Extract-DiscardReasons {
  param([string]$Output)
  $reasons = @()
  foreach ($line in ($Output -split "`r?`n")) {
    if ($line -match '^\s{2}-\s+(.+)$') {
      $text = $Matches[1].Trim()
      if ($text -match '^(Preguntas:|Esquema:)') { continue }
      $norm = Normalize-DiscardReason $text
      if ($norm) { $reasons += $norm }
    }
    elseif ($line -match 'Validaci[oó]n t[eé]cnica fall') {
      $reasons += 'Validacion tecnica fallida'
    }
    elseif ($line -match '503|high demand|alta demanda') {
      $reasons += 'Gemini API 503 (alta demanda temporal)'
    }
  }
  return $reasons
}

function Invoke-GenerateTeil {
  param([int]$Teil)

  if ($Module -eq 'lesen') {
    $script = 'scripts/generate-lesen-part-gemini.mjs'
    $baseCmd = @(
      $script,
      '--provider', 'gemini',
      '--teil', "$Teil",
      '--from-coverage',
      '--fix-retries', "$FixRetries",
      '--api-retries', '3',
      '--word-count', "$WordCount"
    )
  }
  else {
    $script = 'scripts/generate-part-gemini.mjs'
    $baseCmd = @(
      $script,
      '--module', $Module,
      '--provider', 'gemini',
      '--from-coverage',
      '--fix-retries', "$FixRetries",
      '--api-retries', '3',
      '--word-count', "$WordCount"
    )
    if ($Module -eq 'horen') {
      $baseCmd += @('--teil', "$Teil")
    }
  }

  $allLog = New-Object System.Collections.Generic.List[string]
  $totalGuardadas = 0
  $totalDescartadas = 0
  $totalIntentos = 0

  for ($i = 1; $i -le $Sample; $i++) {
    $cmd = $baseCmd + @('--count', '1')
    Write-Host ('  >> [{0}/{1}] node {2}' -f $i, $Sample, ($cmd -join ' ')) -ForegroundColor DarkCyan
    Write-Host '     (1-3 min por parte: Gemini + validacion + posibles reintentos)' -ForegroundColor DarkGray

    $partLog = New-Object System.Collections.Generic.List[string]
    $prevEA = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
      & node @cmd 2>&1 | ForEach-Object {
        $line = $_.ToString()
        [void]$partLog.Add($line)
        [void]$allLog.Add($line)
        Write-Host "     $line"
      }
    }
    finally {
      $ErrorActionPreference = $prevEA
    }
    $code = $LASTEXITCODE

    $partOut = $partLog -join "`n"
    if ($partOut -match '503|high demand') {
      Write-Host '     AVISO: Gemini 503 (servidor saturado). Cuenta como descartada; reintenta mas tarde o usa flash-lite.' -ForegroundColor Yellow
      $totalDescartadas += 1
      Write-Host ('     => parte {0}/{1}: FAIL (503 API)' -f $i, $Sample) -ForegroundColor Red
      Write-Host ''
      continue
    }

    if ($code -ne 0 -and $code -ne 1) {
      throw "Generador termino con exit $code ($Module, parte $i/$Sample)"
    }

    $partSummary = Parse-TeilSummary $partOut $Module $Teil
    $totalGuardadas += $partSummary.Guardadas
    $totalDescartadas += $partSummary.Descartadas
    $totalIntentos += $partSummary.Intentos

    $mark = if ($partSummary.Guardadas -gt 0) { 'OK' } else { 'FAIL' }
    Write-Host ('     => parte {0}/{1}: {2} (intentos API esta parte: {3})' -f $i, $Sample, $mark, $partSummary.Intentos) -ForegroundColor $(if ($mark -eq 'OK') { 'Green' } else { 'Red' })
    Write-Host ''
  }

  # Resumen sintetico compatible con Parse-TeilSummary
  if ($Module -eq 'schreiben' -or $Module -eq 'sprechen') {
    [void]$allLog.Add("${Module}: $totalGuardadas guardadas, $totalDescartadas descartadas, $totalIntentos intentos")
  }
  else {
    [void]$allLog.Add("  T${Teil}: $totalGuardadas guardadas, $totalDescartadas descartadas, $totalIntentos intentos")
  }
  return ($allLog -join "`n")
}

function Get-Recommendation {
  param([double]$Rate, [int]$Teil)
  if ($Rate -ge 70) {
    return "T${Teil}: Flash va bien aqui (acierto >= 70%)"
  }
  if ($Rate -ge 40) {
    return "T${Teil}: aceptable; sube --fix-retries (acierto ${Rate}% en 40-70%)"
  }
  return "T${Teil}: considera cambiar SOLO este Teil a gemini-2.5-pro (GEMINI_MODEL) (acierto ${Rate}% < 40%)"
}

Write-Host ''
Write-Host '===============================================================' -ForegroundColor Yellow
Write-Host ' probar-fiabilidad | Gemini de pago | SIN publicar al pool' -ForegroundColor Yellow
Write-Host (' Module={0} | Sample={1} | FixRetries={2} | WordCount={3} | Teile: {4}' -f $Module, $Sample, $FixRetries, $WordCount, $(if ($Module -eq 'schreiben' -or $Module -eq 'sprechen') { '1-3 (batch)' } else { ($TeilList -join ', ') })) -ForegroundColor Yellow
Write-Host ' Salida: batches/generated/ (no se ejecuta publish ni seed)' -ForegroundColor DarkGray
Write-Host ' NOTA: veras la salida del generador en vivo; cada Teil tarda varios minutos.' -ForegroundColor DarkGray
Write-Host '===============================================================' -ForegroundColor Yellow
Write-Host ''

$allReasons = @()
$results = @{}

foreach ($t in $TeilList) {
  $label = if ($null -eq $t) { $Module } else { "T$t" }
  Write-Host ("-- {0} | generando muestra de {1} --" -f $label, $Sample) -ForegroundColor Green

  $output = Invoke-GenerateTeil -Teil $(if ($null -eq $t) { 0 } else { $t })

  $summary = Parse-TeilSummary $output $Module $(if ($null -eq $t) { 0 } else { $t })
  $pasaron = $summary.Guardadas
  $descartadas = $summary.Descartadas
  $intentos = $summary.Intentos

  if ($Sample -gt 0) {
    $tasa = [Math]::Round(100.0 * $pasaron / $Sample, 1)
  }
  else {
    $tasa = 0.0
  }

  $teilReasons = Extract-DiscardReasons $output
  foreach ($r in $teilReasons) { $allReasons += $r }

  $results[$label] = [ordered]@{
    Intentos    = $intentos
    Pasaron     = $pasaron
    Descartadas = $descartadas
    Tasa        = $tasa
    Reasons     = $teilReasons
  }

  Write-Host ''
  Write-Host ('  {0} resumen muestra:' -f $label) -ForegroundColor Cyan
  Write-Host ('    Intentos totales (API): {0}' -f $intentos)
  Write-Host ('    Partes que pasaron:     {0} / {1}' -f $pasaron, $Sample)
  Write-Host ('    Descartadas:            {0}' -f $descartadas)
  Write-Host ('    Tasa de acierto:        {0}%' -f $tasa)
  Write-Host ''
}

Write-Host '===============================================================' -ForegroundColor Yellow
Write-Host ' RESUMEN GLOBAL' -ForegroundColor Yellow
Write-Host '===============================================================' -ForegroundColor Yellow
Write-Host ''
Write-Host ('{0,-10} {1,10} {2,10} {3,12} {4,10}' -f 'Parte', 'Intentos', 'Pasaron', 'Descartadas', 'Acierto %')
Write-Host ('{0,-10} {1,10} {2,10} {3,12} {4,10}' -f '------', '--------', '-------', '-----------', '---------')
foreach ($key in ($results.Keys | Sort-Object)) {
  $r = $results[$key]
  Write-Host ('{0,-10} {1,10} {2,10} {3,12} {4,9}%' -f $key, $r.Intentos, $r.Pasaron, $r.Descartadas, $r.Tasa)
}

Write-Host ''
Write-Host '-- Recomendacion automatica por parte --' -ForegroundColor Green
foreach ($key in ($results.Keys | Sort-Object)) {
  $teilNum = if ($key -match '^T(\d+)$') { [int]$Matches[1] } else { 0 }
  $rec = Get-Recommendation $results[$key].Tasa $teilNum
  if ($Module -ne 'lesen') { $rec = $rec -replace '^T\d+:', "${key}:" }
  Write-Host "  $rec"
}

Write-Host ''
Write-Host '-- Top 3 motivos de descarte (checker) --' -ForegroundColor Green
$top = $allReasons | Group-Object | Sort-Object Count -Descending | Select-Object -First 3
if (-not $top -or $top.Count -eq 0) {
  Write-Host '  (ninguno registrado en la salida - posible 100% acierto o fallo de API)'
}
else {
  $rank = 1
  foreach ($g in $top) {
    Write-Host ('  {0}. [{1}x] {2}' -f $rank, $g.Count, $g.Name)
    $rank++
  }
}

Write-Host ''
Write-Host 'Listo. Revisa batches/generated/ para inspeccion manual.' -ForegroundColor Green
Write-Host 'Para generar en volumen: .\scripts\generar-hasta-50.ps1 -Target 50' -ForegroundColor DarkGray
Write-Host ''
