Add-Type -AssemblyName System.Drawing

$srcPath = Join-Path $PSScriptRoot "..\client\public\icons\icon-192.png"
if (-not (Test-Path -Path $srcPath)) {
    Write-Error "Source image not found at $srcPath"
    exit 1
}

$origBytes = [System.IO.File]::ReadAllBytes($srcPath)
$ms = New-Object System.IO.MemoryStream(,$origBytes)
$srcBmp = [System.Drawing.Bitmap]::FromStream($ms)

$w = $srcBmp.Width
$h = $srcBmp.Height
Write-Host "Source image size: ${w}x${h}"

# Save master backup if not exists
$masterPath = Join-Path $PSScriptRoot "..\client\public\icons\icon-master.png"
if (-not (Test-Path -Path $masterPath)) {
    $srcBmp.Save($masterPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Saved master PNG backup to $masterPath"
}

# Function to resize bitmap with high quality
function Resize-Image {
    param(
        [System.Drawing.Bitmap]$source,
        [int]$targetWidth,
        [int]$targetHeight,
        [string]$outputPath,
        [double]$scale = 1.0,
        [System.Drawing.Color]$bgColor = [System.Drawing.Color]::FromArgb(11, 59, 36) # #0b3b24 theme green
    )

    $destBmp = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($destBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    # Fill background if maskable with padding
    if ($scale -lt 1.0) {
        $brush = New-Object System.Drawing.SolidBrush($bgColor)
        $g.FillRectangle($brush, 0, 0, $targetWidth, $targetHeight)
        $brush.Dispose()

        $drawW = [int]($targetWidth * $scale)
        $drawH = [int]($targetHeight * $scale)
        $drawX = [int](($targetWidth - $drawW) / 2)
        $drawY = [int](($targetHeight - $drawH) / 2)
        $g.DrawImage($source, $drawX, $drawY, $drawW, $drawH)
    } else {
        $g.Clear([System.Drawing.Color]::Transparent)
        $g.DrawImage($source, 0, 0, $targetWidth, $targetHeight)
    }

    $g.Dispose()

    # Save as PNG
    $destBmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destBmp.Dispose()

    $fileInfo = Get-Item $outputPath
    Write-Host "Created $outputPath ($targetWidth x $targetHeight, $($fileInfo.Length) bytes)"
}

$iconsDir = Join-Path $PSScriptRoot "..\client\public\icons"

# 1. 192x192 regular icon (purpose: any)
Resize-Image -source $srcBmp -targetWidth 192 -targetHeight 192 -outputPath (Join-Path $iconsDir "icon-192.png")

# 2. 512x512 regular icon (purpose: any)
Resize-Image -source $srcBmp -targetWidth 512 -targetHeight 512 -outputPath (Join-Path $iconsDir "icon-512.png")

# 3. 192x192 maskable icon (with 80% safe zone scaling on #0b3b24 theme background)
Resize-Image -source $srcBmp -targetWidth 192 -targetHeight 192 -outputPath (Join-Path $iconsDir "icon-maskable-192.png") -scale 0.82

# 4. 512x512 maskable icon (with 80% safe zone scaling on #0b3b24 theme background)
Resize-Image -source $srcBmp -targetWidth 512 -targetHeight 512 -outputPath (Join-Path $iconsDir "icon-maskable-512.png") -scale 0.82

# 5. icon-maskable.png (512x512 maskable for any legacy references)
Resize-Image -source $srcBmp -targetWidth 512 -targetHeight 512 -outputPath (Join-Path $iconsDir "icon-maskable.png") -scale 0.82

# 6. apple-touch-icon.png (180x180)
Resize-Image -source $srcBmp -targetWidth 180 -targetHeight 180 -outputPath (Join-Path $iconsDir "apple-touch-icon.png")

# 7. 96x96 shortcut icon
Resize-Image -source $srcBmp -targetWidth 96 -targetHeight 96 -outputPath (Join-Path $iconsDir "icon-96.png")

# 8. 1024x1024 hi-res icon for Play Store listing / PWABuilder store package
Resize-Image -source $srcBmp -targetWidth 1024 -targetHeight 1024 -outputPath (Join-Path $iconsDir "icon-1024.png")

$srcBmp.Dispose()
$ms.Dispose()
Write-Host "All icons generated successfully!"
