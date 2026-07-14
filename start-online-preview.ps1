# بالإسلام نهتدي - تشغيل خادم معاينة آمن للهواتف المحمولة عبر رابط إنترنت مؤقت (Pinggy QR)
$basePath = "C:\Users\LionPower\.gemini\antigravity\scratch\quran-memorizer"
$port = 8000

# 1. كتابة كود الخادم المحلي في ملف مؤقت
$serverScript = @"
`$listener = New-Object System.Net.HttpListener
`$listener.Prefixes.Add("http://127.0.0.1:$port/")
`$listener.Start()
while (`$listener.IsListening) {
    try {
        `$context = `$listener.GetContext()
        `$request = `$context.Request
        `$response = `$context.Response
        `$urlPath = `$request.RawUrl.Split('?')[0]
        if (`$urlPath -eq "/") { `$urlPath = "/index.html" }
        `$localFile = Join-Path "$basePath" `$urlPath.Replace('/', '\')
        if (Test-Path `$localFile -PathType Leaf) {
            `$bytes = [System.IO.File]::ReadAllBytes(`$localFile)
            if (`$localFile.EndsWith(".html")) { `$response.ContentType = "text/html; charset=utf-8" }
            elseif (`$localFile.EndsWith(".css")) { `$response.ContentType = "text/css; charset=utf-8" }
            elseif (`$localFile.EndsWith(".js")) { `$response.ContentType = "application/javascript; charset=utf-8" }
            elseif (`$localFile.EndsWith(".mp3")) { `$response.ContentType = "audio/mpeg" }
            `$response.Headers.Add("Access-Control-Allow-Origin", "*")
            `$response.ContentLength64 = `$bytes.Length
            `$response.OutputStream.Write(`$bytes, 0, `$bytes.Length)
        } else {
            `$response.StatusCode = 404
        }
        `$response.Close()
    } catch {}
}
"@

$tempServerFile = "C:\Users\LionPower\AppData\Local\Temp\local-http-server.ps1"
Set-Content -Path $tempServerFile -Value $serverScript -Encoding utf8

# 2. تشغيل الخادم المحلي في الخلفية صامتاً
$serverProcess = Start-Process powershell -ArgumentList "-ExecutionPolicy Bypass -File $tempServerFile" -WindowStyle Hidden -PassThru

# 3. فتح نافذة PowerShell جديدة لتشغيل نفق الـ SSH وعرض كود الـ QR
$sshCommand = "Write-Host '===================================================' -ForegroundColor Green; " +
             "Write-Host '   جاري إنشاء رابط المعاينة وتوليد رمز الـ QR...   ' -ForegroundColor Yellow; " +
             "Write-Host '===================================================' -ForegroundColor Green; " +
             "ssh -o StrictHostKeyChecking=no -p 443 -R 0:127.0.0.1:$port qr@a.pinggy.io"

Start-Process powershell -ArgumentList "-NoExit", "-Command", $sshCommand

Write-Host "==============================================" -ForegroundColor Green
Write-Host "تم تشغيل الخادم المحلي بنجاح!" -ForegroundColor Green
Write-Host "ستفتح نافذة زرقاء جديدة الآن تحتوي على رمز الاستجابة السريعة (QR Code) ورابط المعاينة." -ForegroundColor Yellow
Write-Host "يرجى مسح الرمز بكاميرا هاتفك المحمول أو فتح الرابط وتجربته." -ForegroundColor Yellow
Write-Host "==============================================" -ForegroundColor Green
Write-Host "لإيقاف الخادم وسحب الرابط، اضغط Enter في هذه النافذة."

Read-Host

# 4. تنظيف عند الانتهاء
$serverProcess | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name ssh -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "pinggy.io" } | Stop-Process -Force
Remove-Item $tempServerFile -ErrorAction SilentlyContinue
Write-Host "تم إيقاف تشغيل خادم المعاينة بنجاح." -ForegroundColor Green
