$port = 5173
$appDir = "C:\Cursor\38muhasebe\modern-finance-app"

function Stop-App {
    Write-Host "Uygulama durduruluyor..." -ForegroundColor Yellow
    $processes = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess
    if ($processes) {
        foreach ($p in $processes) {
            # Kill the process tree to make sure vite and node are gone
            Get-CimInstance Win32_Process -Filter "ParentProcessId = $p" | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        }
    }
    # Backup check: kill any node process running vite in this directory
    Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*vite*" -and $_.Path -like "*$appDir*" } | Stop-Process -Force -ErrorAction SilentlyContinue
    
    Write-Host "Uygulama basariyla durduruldu." -ForegroundColor Green
}

function Start-App {
    Write-Host "Uygulama baslatiliyor..." -ForegroundColor Cyan
    # Run npm run dev in a minimized window
    Start-Process cmd -ArgumentList "/c cd /d `"$appDir`" && npm run dev" -WindowStyle Minimized
    
    Write-Host "Sunucunun hazir olmasi bekleniyor..." -ForegroundColor Gray
    $timeout = 20
    $elapsed = 0
    while ($elapsed -lt $timeout) {
        if (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }) {
            break
        }
        Start-Sleep -Seconds 1
        $elapsed++
    }
    
    if ($elapsed -lt $timeout) {
        Start-Process "http://localhost:$port"
        Write-Host "Uygulama baslatildi ve tarayicida acildi." -ForegroundColor Green
    } else {
        Write-Host "HATA: Uygulama baslatilamadi veya zaman asimina ugradi." -ForegroundColor Red
    }
}

# MAIN LOGIC
$connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' }

if ($connection) {
    Stop-App
} else {
    Start-App
}

Write-Host "Pencere 3 saniye icinde kapanacak..."
Start-Sleep -Seconds 3
