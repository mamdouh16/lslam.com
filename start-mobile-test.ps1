# بالإسلام نهتدي - تشغيل خادم معاينة محلي للهواتف المتصلة بنفس شبكة الواي فاي
$ip = Get-NetIPAddress -InterfaceAddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.InterfaceAlias -notlike "*Loopback*" } | Select-Object -ExpandProperty IPAddress | Select-Object -First 1

if (-not $ip) {
    $ip = "localhost"
}

$port = 8000
$url = "http://$($ip):$($port)/"

Write-Host "==============================================" -ForegroundColor Green
Write-Host "تطبيق (بالإسلام نهتدي) - خادم شبكة الواي فاي" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
Write-Host "تأكد من أن هاتفك متصل بنفس شبكة الواي فاي (Wi-Fi) للكمبيوتر." -ForegroundColor Yellow
Write-Host "ثم افتح الرابط التالي على متصفح هاتفك:" -ForegroundColor Yellow
Write-Host "👉 $url" -ForegroundColor Green -NoNewline
Write-Host " 👈" -ForegroundColor Green
Write-Host "==============================================" -ForegroundColor Green
Write-Host "لتوقيف الخادم، أغلق هذه النافذة أو اضغط Ctrl + C." -ForegroundColor Red

# Start HTTP Listener
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
if ($ip -ne "localhost") {
    $listener.Prefixes.Add("http://$($ip):$port/")
}

try {
    $listener.Start()
} catch {
    Write-Host "خطأ: المنفذ $port مشغول أو يتطلب صلاحيات مسؤول. يرجى إغلاق أي خادم ويب آخر والمحاولة ثانية." -ForegroundColor Red
    Exit
}

$basePath = "C:\Users\LionPower\.gemini\antigravity\scratch\quran-memorizer"

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        $urlPath = $request.RawUrl.Split('?')[0]
        if ($urlPath -eq "/") { $urlPath = "/index.html" }
        
        $localFile = Join-Path $basePath $urlPath.Replace('/', '\')
        
        if (Test-Path $localFile -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($localFile)
            
            if ($localFile.EndsWith(".html")) { $response.ContentType = "text/html; charset=utf-8" }
            elseif ($localFile.EndsWith(".css")) { $response.ContentType = "text/css; charset=utf-8" }
            elseif ($localFile.EndsWith(".js")) { $response.ContentType = "application/javascript; charset=utf-8" }
            elseif ($localFile.EndsWith(".mp3")) { $response.ContentType = "audio/mpeg" }
            
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
        }
        $response.Close()
    } catch {
        # Connection closed
    }
}
