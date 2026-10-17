# ═══════════════════════════════════════════════════════════════
# Serveur Web Local & Proxy Streaming Universel pour BOKK TV
# Port : 8080 (http://localhost:8080)
# ═══════════════════════════════════════════════════════════════

$port = 8080
$path = $PSScriptRoot
if (-not $path) { $path = (Get-Location).Path }

# Vérifier si Python est disponible pour une performance optimale multi-thread
$hasPython = $false
try {
    $pyCheck = & python --version 2>&1
    if ($LASTEXITCODE -eq 0 -or $pyCheck -match "Python") {
        $hasPython = $true
    }
} catch {
    $hasPython = $false
}

if ($hasPython -and (Test-Path (Join-Path $path "server.py"))) {
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "   BOKK TV demarre avec le moteur de streaming Python !" -ForegroundColor Cyan
    Write-Host "   Ouvrez votre navigateur : http://localhost:$port/" -ForegroundColor Yellow
    Write-Host "   Proxy de streaming actif sur : http://localhost:$port/proxy" -ForegroundColor Green
    Write-Host "   Appuyez sur Ctrl+C dans ce terminal pour arreter." -ForegroundColor DarkGray
    Write-Host "==========================================================" -ForegroundColor Green

    Start-Process "http://localhost:$port/"
    & python (Join-Path $path "server.py") $port
    exit
}

# ── Serveur de secours PowerShell avec support Proxy ──
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
    Write-Host "==========================================================" -ForegroundColor Green
    Write-Host "   BOKK TV est en ligne (moteur PowerShell) !" -ForegroundColor Cyan
    Write-Host "   Ouvrez votre navigateur : http://localhost:$port/" -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Green

    Start-Process "http://localhost:$port/"

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.AddHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        $response.AddHeader("Access-Control-Allow-Headers", "*")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        # Gérer /proxy?url=
        if ($request.Url.LocalPath -eq "/proxy") {
            $targetUrl = $request.QueryString["url"]
            if ([string]::IsNullOrWhiteSpace($targetUrl)) {
                $response.StatusCode = 400
                $msg = [System.Text.Encoding]::UTF8.GetBytes("Parametre url manquant")
                $response.OutputStream.Write($msg, 0, $msg.Length)
                $response.Close()
                continue
            }

            try {
                $webReq = [System.Net.HttpWebRequest]::Create($targetUrl)
                $webReq.Method = "GET"
                $webReq.Timeout = 10000
                $webReq.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                $webReq.ServerCertificateValidationCallback = { $true }

                $webResp = $webReq.GetResponse()
                $respStream = $webResp.GetResponseStream()

                $contentType = $webResp.ContentType
                if (-not $contentType) { $contentType = "application/octet-stream" }
                $response.ContentType = $contentType

                $isM3u8 = ($contentType -like "*mpegurl*" -or $targetUrl -like "*.m3u8")

                if ($isM3u8) {
                    $reader = New-Object System.IO.StreamReader($respStream)
                    $content = $reader.ReadToEnd()
                    $reader.Close()

                    $finalUrl = $webResp.ResponseUri.AbsoluteUri
                    $lines = $content -split "`r?`n"
                    $outLines = [System.Collections.Generic.List[string]]::new()

                    foreach ($l in $lines) {
                        $trimmed = $l.Trim()
                        if ([string]::IsNullOrWhiteSpace($trimmed)) {
                            $outLines.Add($l)
                        } elseif ($trimmed.StartsWith("#")) {
                            if ($trimmed.Contains('URI="')) {
                                $rewrittenTag = [regex]::Replace($trimmed, 'URI="([^"]+)"', {
                                    param($m)
                                    $attr = [System.Uri]::new([System.Uri]::new($finalUrl), $m.Groups[1].Value).AbsoluteUri
                                    return 'URI="/proxy?url=' + [System.Uri]::EscapeDataString($attr) + '"'
                                })
                                $outLines.Add($rewrittenTag)
                            } else {
                                $outLines.Add($l)
                            }
                        } else {
                            $resolved = [System.Uri]::new([System.Uri]::new($finalUrl), $trimmed).AbsoluteUri
                            $outLines.Add("/proxy?url=" + [System.Uri]::EscapeDataString($resolved))
                        }
                    }

                    $bytes = [System.Text.Encoding]::UTF8.GetBytes(($outLines -join "`n"))
                    $response.ContentType = "application/vnd.apple.mpegurl; charset=utf-8"
                    $response.ContentLength64 = $bytes.Length
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                } else {
                    $buffer = New-Object byte[] 65536
                    while (($bytesRead = $respStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                        $response.OutputStream.Write($buffer, 0, $bytesRead)
                    }
                    $respStream.Close()
                }
                $webResp.Close()
            } catch {
                $response.StatusCode = 502
                $msg = [System.Text.Encoding]::UTF8.GetBytes("Erreur proxy : " + $_.Exception.Message)
                $response.OutputStream.Write($msg, 0, $msg.Length)
            }
            $response.Close()
            continue
        }

        # Fichiers statiques normaux
        $urlPath = $request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($urlPath)) {
            $urlPath = "index.html"
        }

        $filePath = Join-Path $path $urlPath

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".jpeg" { "image/jpeg" }
                ".svg"  { "image/svg+xml" }
                ".ico"  { "image/x-icon" }
                Default { "application/octet-stream" }
            }

            $response.ContentType = $contentType
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Fichier non trouve")
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }

        $response.Close()
    }
} catch {
    Write-Host "Erreur ou arret du serveur: $_" -ForegroundColor Red
} finally {
    $listener.Stop()
    $listener.Close()
}
