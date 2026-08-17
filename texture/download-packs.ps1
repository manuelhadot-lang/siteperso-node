# Telecharge des packs AmbientCG (CC0) + HDRI Poly Haven (CC0) dans texture/
# Usage: powershell -ExecutionPolicy Bypass -File texture/download-packs.ps1

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Tmp = Join-Path $env:TEMP "lab3d-texture-dl"
New-Item -ItemType Directory -Force -Path $Tmp | Out-Null

function Ensure-Dir($p) {
  New-Item -ItemType Directory -Force -Path $p | Out-Null
}

function Copy-Maps($extractDir, $destDir, $prefix) {
  Ensure-Dir $destDir
  $mapNames = @(
    @{ Pat = "*Color*";   Out = "${prefix}_color.jpg" },
    @{ Pat = "*NormalGL*"; Out = "${prefix}_normal.jpg" },
    @{ Pat = "*NormalDX*"; Out = "${prefix}_normal.jpg" },
    @{ Pat = "*Roughness*"; Out = "${prefix}_roughness.jpg" },
    @{ Pat = "*AmbientOcclusion*"; Out = "${prefix}_ao.jpg" },
    @{ Pat = "*Displacement*"; Out = "${prefix}_displacement.jpg" }
  )
  foreach ($m in $mapNames) {
    $src = Get-ChildItem -Path $extractDir -Recurse -File -Filter $m.Pat -ErrorAction SilentlyContinue |
      Where-Object { $_.Extension -match '\.(jpg|jpeg|png)$' } |
      Select-Object -First 1
    if ($src -and -not (Test-Path (Join-Path $destDir $m.Out))) {
      Copy-Item $src.FullName (Join-Path $destDir $m.Out) -Force
    }
  }
}

function Get-AmbientCG($fileName, $destRel, $prefix) {
  $destDir = Join-Path $Root $destRel
  $marker = Join-Path $destDir "${prefix}_color.jpg"
  if (Test-Path $marker) {
    Write-Host "[skip] $prefix deja present"
    return
  }
  Write-Host "[dl] $fileName -> $destRel"
  $zip = Join-Path $Tmp $fileName
  $url = "https://ambientcg.com/get?file=$fileName"
  try {
    curl.exe -L --connect-timeout 20 --max-time 90 -o $zip $url
    if (-not (Test-Path $zip) -or (Get-Item $zip).Length -lt 1000) {
      Write-Host "[fail] telechargement vide: $fileName"
      return
    }
    $extract = Join-Path $Tmp ($fileName -replace '\.zip$','')
    if (Test-Path $extract) { Remove-Item $extract -Recurse -Force }
    Expand-Archive -Path $zip -DestinationPath $extract -Force
    Copy-Maps $extract $destDir $prefix
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "[ok] $prefix"
  } catch {
    Write-Host "[err] $fileName : $_"
  }
}

function Get-Hdri($slug, $res, $outName) {
  $destDir = Join-Path $Root "hdri"
  Ensure-Dir $destDir
  $out = Join-Path $destDir $outName
  if (Test-Path $out) {
    Write-Host "[skip] HDRI $outName"
    return
  }
  Write-Host "[dl] HDRI $slug $res"
  $url = "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/$res/${slug}_${res}.hdr"
  try {
    curl.exe -L --connect-timeout 20 --max-time 120 -o $out $url
    if ((Test-Path $out) -and (Get-Item $out).Length -gt 1000) {
      Write-Host "[ok] $outName"
    } else {
      Write-Host "[fail] HDRI $slug"
      Remove-Item $out -Force -ErrorAction SilentlyContinue
    }
  } catch {
    Write-Host "[err] HDRI $slug : $_"
  }
}

# --- AmbientCG 1K JPG ---
Get-AmbientCG "Grass001_1K-JPG.zip" "herbe" "grass001"
Get-AmbientCG "Grass002_1K-JPG.zip" "herbe" "grass002"
Get-AmbientCG "Ground037_1K-JPG.zip" "herbe" "ground037"
Get-AmbientCG "Rock023_1K-JPG.zip" "pierre" "rock023"
Get-AmbientCG "Rock048_1K-JPG.zip" "pierre" "rock048"
Get-AmbientCG "PavingStones037_1K-JPG.zip" "pave" "paving037"
Get-AmbientCG "PavingStones050_1K-JPG.zip" "pave" "paving050"
Get-AmbientCG "Wood051_1K-JPG.zip" "bois" "wood051"
Get-AmbientCG "WoodFloor043_1K-JPG.zip" "bois" "woodfloor043"
Get-AmbientCG "Bark012_1K-JPG.zip" "bois" "bark012"
Get-AmbientCG "Bricks059_1K-JPG.zip" "brique" "bricks059"
Get-AmbientCG "Facade001_1K-JPG.zip" "brique" "facade001"
Get-AmbientCG "Tiles074_1K-JPG.zip" "tuiles" "tiles074"
Get-AmbientCG "Tiles093_1K-JPG.zip" "tuiles" "tiles093"
Get-AmbientCG "Concrete034_1K-JPG.zip" "beton" "concrete034"
Get-AmbientCG "Concrete031_1K-JPG.zip" "beton" "concrete031"
Get-AmbientCG "Road006_1K-JPG.zip" "bitume" "road006"
Get-AmbientCG "Metal032_1K-JPG.zip" "metal" "metal032"
Get-AmbientCG "MetalPlates006_1K-JPG.zip" "metal" "metalplates006"
Get-AmbientCG "Fabric045_1K-JPG.zip" "tissus" "fabric045"
Get-AmbientCG "Leather011_1K-JPG.zip" "tissus" "leather011"
Get-AmbientCG "Snow006_1K-JPG.zip" "neige" "snow006"
Get-AmbientCG "Ground004_1K-JPG.zip" "sable" "ground004"
Get-AmbientCG "Ground003_1K-JPG.zip" "sol" "ground003"
Get-AmbientCG "Ground029_1K-JPG.zip" "sol" "ground029"
Get-AmbientCG "Gravel023_1K-JPG.zip" "sol" "gravel023"
Get-AmbientCG "PaintedPlaster017_1K-JPG.zip" "decalcomanie" "plaster017"
Get-AmbientCG "PaintedMetal001_1K-JPG.zip" "decalcomanie" "paintedmetal001"

# --- Poly Haven HDRI 1k ---
Get-Hdri "kloppenheim_06_puresky" "1k" "kloppenheim_06_puresky_1k.hdr"
Get-Hdri "syferfontein_18d_clear_puresky" "1k" "syferfontein_18d_clear_puresky_1k.hdr"
Get-Hdri "meadow_2" "1k" "meadow_2_1k.hdr"
Get-Hdri "industrial_sunset_puresky" "1k" "industrial_sunset_puresky_1k.hdr"
Get-Hdri "venice_sunset" "1k" "venice_sunset_1k.hdr"

Write-Host ""
Write-Host "Termine. Contenu:"
Get-ChildItem -Path $Root -Recurse -File |
  Where-Object { $_.Name -ne "download-packs.ps1" -and $_.Name -ne "README.md" } |
  ForEach-Object { $_.FullName.Substring($Root.Length + 1) }
