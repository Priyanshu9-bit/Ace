Add-Type -AssemblyName System.Drawing

$logoPath = Join-Path $PSScriptRoot "..\client\public\icons\icon-512.png"
$logoBmp = [System.Drawing.Bitmap]::FromFile($logoPath)
$screenshotsDir = Join-Path $PSScriptRoot "..\client\public\screenshots"

function Draw-Card {
    param(
        [System.Drawing.Graphics]$g,
        [int]$x,
        [int]$y,
        [int]$w,
        [int]$h,
        [string]$rank,
        [string]$suit,
        [System.Drawing.Color]$suitColor,
        [double]$angle = 0.0
    )

    $state = $g.Save()
    $g.TranslateTransform($x + $w/2, $y + $h/2)
    if ($angle -ne 0) { $g.RotateTransform($angle) }
    $g.TranslateTransform(-($w/2), -($h/2))

    # Shadow
    $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(60, 0, 0, 0))
    $g.FillRectangle($shadowBrush, 4, 4, $w, $h)
    $shadowBrush.Dispose()

    # Card background (ivory white)
    $cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(250, 248, 242))
    $g.FillRectangle($cardBrush, 0, 0, $w, $h)
    $cardBrush.Dispose()

    # Border
    $borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(200, 180, 140), 2)
    $g.DrawRectangle($borderPen, 0, 0, $w, $h)
    $borderPen.Dispose()

    # Rank & Suit
    $textBrush = New-Object System.Drawing.SolidBrush($suitColor)
    $fontRank = New-Object System.Drawing.Font("Arial", [int]($w * 0.22), [System.Drawing.FontStyle]::Bold)
    $fontSuit = New-Object System.Drawing.Font("Arial", [int]($w * 0.28), [System.Drawing.FontStyle]::Regular)

    $g.DrawString($rank, $fontRank, $textBrush, [float]6, [float]6)
    $g.DrawString($suit, $fontSuit, $textBrush, [float]6, [float]($w * 0.28))

    # Center big suit
    $fontBigSuit = New-Object System.Drawing.Font("Arial", [int]($w * 0.40), [System.Drawing.FontStyle]::Regular)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString($suit, $fontBigSuit, $textBrush, [float]($w/2), [float]($h/2), $sf)

    $textBrush.Dispose()
    $fontRank.Dispose()
    $fontSuit.Dispose()
    $fontBigSuit.Dispose()
    $sf.Dispose()

    $g.Restore($state)
}

function Create-Wide-Screenshot {
    $w = 1280
    $h = 720
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    # Background felt gradient
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0, 0)),
        (New-Object System.Drawing.Point(0, $h)),
        [System.Drawing.Color]::FromArgb(12, 45, 28),
        [System.Drawing.Color]::FromArgb(5, 18, 12)
    )
    $g.FillRectangle($bgBrush, 0, 0, $w, $h)
    $bgBrush.Dispose()

    # Table oval felt
    $tableRect = New-Object System.Drawing.Rectangle(60, 40, ($w - 120), ($h - 80))
    $tableBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(9, 36, 22))
    $g.FillEllipse($tableBrush, $tableRect)
    $tableBrush.Dispose()

    $tablePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(212, 175, 55), 4) # Gold
    $g.DrawEllipse($tablePen, $tableRect)
    $tablePen.Dispose()

    # Center logo
    $logoSize = 160
    $logoX = [int](($w - $logoSize) / 2)
    $logoY = [int](($h - $logoSize) / 2 - 40)
    $g.DrawImage($logoBmp, $logoX, $logoY, $logoSize, $logoSize)

    # Title & Room info
    $titleFont = New-Object System.Drawing.Font("Arial", 22, [System.Drawing.FontStyle]::Bold)
    $subFont = New-Object System.Drawing.Font("Arial", 14, [System.Drawing.FontStyle]::Regular)
    $goldBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 195, 80))
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 240, 235))
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center

    $g.DrawString("GADHAA (DONKEY / BHABHI) · TABLE #401", $titleFont, $goldBrush, [float]($w / 2), [float]($logoY + $logoSize + 10), $sf)
    $g.DrawString("Real-time Multiplayer · Voice Chat Active · Odia Traditional Game", $subFont, $whiteBrush, [float]($w / 2), [float]($logoY + $logoSize + 45), $sf)

    # Top Player badge
    $topBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200, 20, 20, 20))
    $g.FillRectangle($topBrush, [int]($w/2 - 100), 55, 200, 40)
    $g.DrawString("Priya (Safe) 👑", $subFont, $goldBrush, [float]($w/2), [float]65, $sf)

    # Left Player badge
    $g.FillRectangle($topBrush, 80, [int]($h/2 - 30), 160, 60)
    $g.DrawString("Rahul", $subFont, $whiteBrush, [float]160, [float]($h/2 - 22), $sf)
    $g.DrawString("🎙️ Speaking", $subFont, $goldBrush, [float]160, [float]($h/2), $sf)

    # Right Player badge
    $g.FillRectangle($topBrush, $w - 240, [int]($h/2 - 30), 160, 60)
    $g.DrawString("Amit", $subFont, $whiteBrush, [float]($w - 160), [float]($h/2 - 22), $sf)
    $g.DrawString("3 Cards Left", $subFont, $whiteBrush, [float]($w - 160), [float]($h/2), $sf)

    # Hand cards at bottom
    $cardW = 75
    $cardH = 110
    $startY = $h - 135
    $handX = [int]($w/2 - 210)
    $red = [System.Drawing.Color]::FromArgb(210, 30, 30)
    $black = [System.Drawing.Color]::FromArgb(20, 20, 20)

    Draw-Card -g $g -x ($handX + 0)   -y ($startY + 8)  -w $cardW -h $cardH -rank "A"  -suit [char]0x2660 -suitColor $black -angle -8
    Draw-Card -g $g -x ($handX + 70)  -y ($startY + 2)  -w $cardW -h $cardH -rank "K"  -suit [char]0x2665 -suitColor $red   -angle -4
    Draw-Card -g $g -x ($handX + 140) -y ($startY)      -w $cardW -h $cardH -rank "Q"  -suit [char]0x2666 -suitColor $red   -angle 0
    Draw-Card -g $g -x ($handX + 210) -y ($startY + 2)  -w $cardW -h $cardH -rank "J"  -suit [char]0x2663 -suitColor $black -angle 4
    Draw-Card -g $g -x ($handX + 280) -y ($startY + 8)  -w $cardW -h $cardH -rank "10" -suit [char]0x2660 -suitColor $black -angle 8

    # Save
    $outPath = Join-Path $screenshotsDir "screen-wide.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Created wide screenshot: $outPath ($w x $h)"

    $titleFont.Dispose()
    $subFont.Dispose()
    $goldBrush.Dispose()
    $whiteBrush.Dispose()
    $topBrush.Dispose()
    $sf.Dispose()
    $g.Dispose()
    $bmp.Dispose()
}

function Create-Narrow-Screenshot {
    $w = 720
    $h = 1280
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

    # Background felt gradient
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0, 0)),
        (New-Object System.Drawing.Point(0, $h)),
        [System.Drawing.Color]::FromArgb(12, 45, 28),
        [System.Drawing.Color]::FromArgb(5, 18, 12)
    )
    $g.FillRectangle($bgBrush, 0, 0, $w, $h)
    $bgBrush.Dispose()

    # Table oval felt
    $tableRect = New-Object System.Drawing.Rectangle(40, 100, ($w - 80), ($h - 320))
    $tableBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(9, 36, 22))
    $g.FillEllipse($tableBrush, $tableRect)
    $tableBrush.Dispose()

    $tablePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(212, 175, 55), 4) # Gold
    $g.DrawEllipse($tablePen, $tableRect)
    $tablePen.Dispose()

    # Header bar
    $barBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 10, 30, 20))
    $g.FillRectangle($barBrush, 0, 0, $w, 80)
    $barBrush.Dispose()

    $titleFont = New-Object System.Drawing.Font("Arial", 22, [System.Drawing.FontStyle]::Bold)
    $subFont = New-Object System.Drawing.Font("Arial", 14, [System.Drawing.FontStyle]::Regular)
    $goldBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 195, 80))
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 240, 235))
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center

    $g.DrawString("GADHAA · TABLE #401", $titleFont, $goldBrush, [float]($w / 2), [float]15, $sf)
    $g.DrawString("🎙️ Voice Connected · Live Multiplayer", $subFont, $whiteBrush, [float]($w / 2), [float]48, $sf)

    # Center mascot logo
    $logoSize = 200
    $logoX = [int](($w - $logoSize) / 2)
    $logoY = [int](($h - $logoSize) / 2 - 80)
    $g.DrawImage($logoBmp, $logoX, $logoY, $logoSize, $logoSize)

    # Lead trick cards in center table
    $cardW = 75
    $cardH = 110
    $red = [System.Drawing.Color]::FromArgb(210, 30, 30)
    $black = [System.Drawing.Color]::FromArgb(20, 20, 20)

    Draw-Card -g $g -x ([int]($w/2 - 40)) -y ($logoY + $logoSize + 25) -w $cardW -h $cardH -rank "A" -suit [char]0x2660 -suitColor $black

    $g.DrawString("♠ Ace of Spades Led", $subFont, $goldBrush, [float]($w / 2), [float]($logoY + $logoSize + 150), $sf)

    # Bottom Player hand
    $startY = $h - 220
    $handX = [int]($w/2 - 180)

    Draw-Card -g $g -x ($handX + 0)   -y ($startY + 10) -w 80 -h 120 -rank "K"  -suit [char]0x2665 -suitColor $red   -angle -8
    Draw-Card -g $g -x ($handX + 60)  -y ($startY + 2)  -w 80 -h 120 -rank "Q"  -suit [char]0x2666 -suitColor $red   -angle -3
    Draw-Card -g $g -x ($handX + 120) -y ($startY)      -w 80 -h 120 -rank "J"  -suit [char]0x2663 -suitColor $black -angle 0
    Draw-Card -g $g -x ($handX + 180) -y ($startY + 2)  -w 80 -h 120 -rank "10" -suit [char]0x2660 -suitColor $black -angle 3
    Draw-Card -g $g -x ($handX + 240) -y ($startY + 10) -w 80 -h 120 -rank "9"  -suit [char]0x2660 -suitColor $black -angle 8

    # Bottom status bar
    $botBarBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 10, 30, 20))
    $g.FillRectangle($botBarBrush, 0, $h - 70, $w, 70)
    $botBarBrush.Dispose()

    $g.DrawString("YOUR TURN TO PLAY A SPADE ♠", $titleFont, $goldBrush, [float]($w / 2), [float]($h - 52), $sf)

    # Save
    $outPath = Join-Path $screenshotsDir "screen-narrow.png"
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host "Created narrow screenshot: $outPath ($w x $h)"

    $titleFont.Dispose()
    $subFont.Dispose()
    $goldBrush.Dispose()
    $whiteBrush.Dispose()
    $sf.Dispose()
    $g.Dispose()
    $bmp.Dispose()
}

Create-Wide-Screenshot
Create-Narrow-Screenshot

$logoBmp.Dispose()
Write-Host "All screenshots created successfully!"
