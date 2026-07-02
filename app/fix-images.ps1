Add-Type -AssemblyName System.Drawing

$dir = Join-Path $PSScriptRoot "assets\images"
$files = @("icon.png", "android-icon-foreground.png", "splash-icon.png")

foreach ($f in $files) {
    $path = Join-Path $dir $f
    if (Test-Path $path) {
        $fullPath = (Resolve-Path $path).Path
        $img = [System.Drawing.Image]::FromFile($fullPath)
        $tempPath = "$fullPath.tmp.png"
        $img.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $img.Dispose()
        Remove-Item $fullPath -Force
        Move-Item $tempPath $fullPath
        Write-Host "Converted: $f"
    } else {
        Write-Host "Not found: $f"
    }
}
