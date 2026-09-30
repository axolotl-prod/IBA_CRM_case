param(
  [Parameter(Mandatory = $true)][string]$ExcelPath,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$resolvedExcel = (Resolve-Path $ExcelPath).Path
$resolvedOutput = [IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPath))
$outputDirectory = Split-Path $resolvedOutput
if (-not (Test-Path $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$archive = [IO.Compression.ZipFile]::OpenRead($resolvedExcel)

function Read-ZipEntry([string]$name) {
  $entry = $archive.GetEntry($name)
  if (-not $entry) { throw "Missing Excel archive entry: $name" }
  $reader = [IO.StreamReader]::new($entry.Open())
  try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

function Get-ColumnNumber([string]$reference) {
  $number = 0
  foreach ($character in (($reference -replace '[^A-Z]', '').ToCharArray())) {
    $number = $number * 26 + ([int]$character - [int][char]'A' + 1)
  }
  return $number
}

try {
  $sharedStrings = @()
  [xml]$sharedXml = Read-ZipEntry 'xl/sharedStrings.xml'
  foreach ($item in $sharedXml.sst.si) {
    $parts = @()
    if ($item.t) { $parts += [string]$item.t }
    foreach ($run in $item.r) { $parts += [string]$run.t }
    $sharedStrings += ($parts -join '')
  }

  function Get-CellValue($cell) {
    $value = [string]$cell.v
    if ($cell.t -eq 's' -and $value -ne '') { return $sharedStrings[[int]$value] }
    if ($cell.t -eq 'inlineStr') {
      $parts = @()
      if ($cell.is.t) { $parts += [string]$cell.is.t }
      foreach ($run in $cell.is.r) { $parts += [string]$run.t }
      return $parts -join ''
    }
    return $value
  }

  [xml]$workbook = Read-ZipEntry 'xl/workbook.xml'
  [xml]$relationships = Read-ZipEntry 'xl/_rels/workbook.xml.rels'
  $targets = @{}
  foreach ($relationship in $relationships.Relationships.Relationship) {
    $targets[$relationship.Id] = [string]$relationship.Target
  }

  $sheetRows = @{}
  $sheetIndex = 0
  foreach ($sheet in $workbook.workbook.sheets.sheet) {
    if ($sheetIndex -ge 3) { break }
    $relationshipId = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    $target = $targets[$relationshipId]
    if ($target -notmatch '^xl/') { $target = 'xl/' + $target.TrimStart('/') }
    [xml]$sheetXml = Read-ZipEntry $target
    $rows = @()
    foreach ($row in @($sheetXml.worksheet.sheetData.row) | Select-Object -Skip 1) {
      $values = @{}
      foreach ($cell in $row.c) {
        $value = Get-CellValue $cell
        if ($value -ne '') { $values[(Get-ColumnNumber $cell.r)] = $value }
      }
      if ($values.Count) { $rows += [pscustomobject]@{ row = [int]$row.r; values = $values } }
    }
    $sheetKey = @('pasha', 'alina', 'payments')[$sheetIndex]
    $sheetRows[$sheetKey] = $rows
    $sheetIndex++
  }

  $leads = @()
  foreach ($source in $sheetRows['pasha']) {
    $v = $source.values
    if (-not $v[4]) { continue }
    $leads += [pscustomobject]@{
      sheet = 'pasha'; row = $source.row; date = $v[1]; name = $v[4]
      phone = $v[2]; telegram = $v[3]; income = $v[5]; request = $v[6]
      rawStatus = $v[7]; tariff = $v[8]; amount = $v[9]; net = $v[10]
      paymentMethod = $v[11]; paidAt = ''; comment = $v[12]; manager = 'pasha'
    }
  }
  foreach ($source in $sheetRows['alina']) {
    $v = $source.values
    if (-not $v[2]) { continue }
    $commentParts = @($v[13], $v[15]) | Where-Object { $_ }
    $leads += [pscustomobject]@{
      sheet = 'alina'; row = $source.row; date = $v[1]; name = $v[2]
      phone = $v[3]; telegram = $v[4]; income = $v[5]; request = $v[6]
      rawStatus = $v[7]; tariff = $v[8]; amount = $v[9]; net = $v[10]
      paymentMethod = $v[11]; paidAt = $v[12]; comment = ($commentParts -join "`n"); manager = 'alina'
    }
  }

  $payments = @()
  foreach ($source in $sheetRows['payments']) {
    $v = $source.values
    if (-not $v[1] -or $v[1] -notmatch '^\d+(\.\d+)?$' -or -not $v[2]) { continue }
    $payments += [pscustomobject]@{
      sheet = 'payments'; row = $source.row; order = $v[1]; name = $v[2]
      contact = $v[3]; tariff = $v[4]; revenue = $v[5]; net = $v[6]
      debt = $v[7]; paymentMethod = $v[8]; paidAt = $v[9]
      manager = $v[10]; schedule = $v[11]
    }
  }

  $result = [ordered]@{
    source = $resolvedExcel
    importedAt = [DateTime]::UtcNow.ToString('o')
    leads = $leads
    payments = $payments
  }
  [IO.File]::WriteAllText($resolvedOutput, ($result | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
  Write-Output "Prepared from Excel: leads=$($leads.Count), payments=$($payments.Count)"
} finally {
  $archive.Dispose()
}
