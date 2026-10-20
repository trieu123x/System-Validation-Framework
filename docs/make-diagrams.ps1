# Ve so do kien truc va so do tuan tu luong cap hang ra docs/img (Windows PowerShell 5.1, System.Drawing).
Add-Type -AssemblyName System.Drawing
$dir = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'img'
New-Item -ItemType Directory -Force $dir | Out-Null

$ink = [System.Drawing.Color]::FromArgb(27, 31, 36)
$muted = [System.Drawing.Color]::FromArgb(91, 100, 112)
$blue = [System.Drawing.Color]::FromArgb(36, 99, 235)
$blueSoft = [System.Drawing.Color]::FromArgb(232, 239, 255)
$green = [System.Drawing.Color]::FromArgb(26, 127, 75)
$greenSoft = [System.Drawing.Color]::FromArgb(227, 245, 234)
$amber = [System.Drawing.Color]::FromArgb(161, 92, 0)
$amberSoft = [System.Drawing.Color]::FromArgb(255, 241, 214)
$gray = [System.Drawing.Color]::FromArgb(240, 242, 245)
$f = New-Object System.Drawing.Font('Segoe UI', 13)
$fs = New-Object System.Drawing.Font('Segoe UI', 11)
$fb = New-Object System.Drawing.Font('Segoe UI', 15, [System.Drawing.FontStyle]::Bold)
$fm = New-Object System.Drawing.Font('Consolas', 11)

function New-Canvas($w, $h) {
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'ClearTypeGridFit'
    $g.Clear([System.Drawing.Color]::White)
    return @($bmp, $g)
}

function Box($g, $x, $y, $w, $h, $fill, $stroke, $title, $lines) {
    $g.FillRectangle((New-Object System.Drawing.SolidBrush $fill), $x, $y, $w, $h)
    $g.DrawRectangle((New-Object System.Drawing.Pen $stroke, 2), $x, $y, $w, $h)
    $g.DrawString($title, $fb, (New-Object System.Drawing.SolidBrush $ink), $x + 12, $y + 8)
    $yy = $y + 40
    foreach ($l in $lines) {
        $g.DrawString($l, $fs, (New-Object System.Drawing.SolidBrush $ink), $x + 16, $yy)
        $yy += 22
    }
}

function Arrow($g, $x1, $y1, $x2, $y2, $color, $label, [switch]$both, [switch]$dash) {
    $p = New-Object System.Drawing.Pen $color, 2.5
    if ($dash) { $p.DashStyle = 'Dash' }
    $cap = New-Object System.Drawing.Drawing2D.AdjustableArrowCap 5, 6
    $p.CustomEndCap = $cap
    if ($both) { $p.CustomStartCap = $cap }
    $g.DrawLine($p, $x1, $y1, $x2, $y2)
    if ($label) {
        $sz = $g.MeasureString($label, $fs)
        $lx = ($x1 + $x2) / 2 - $sz.Width / 2; $ly = ($y1 + $y2) / 2 - $sz.Height - 2
        $g.FillRectangle([System.Drawing.Brushes]::White, $lx - 2, $ly, $sz.Width + 4, $sz.Height)
        $g.DrawString($label, $fs, (New-Object System.Drawing.SolidBrush $color), $lx, $ly)
    }
}

# ===================== Kiến trúc =====================
$c = New-Canvas 1600 900; $bmp = $c[0]; $g = $c[1]
$g.DrawString('Kiến trúc hệ thống phân phối hàng hóa', (New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush $ink), 30, 20)

Box $g 40 90 300 160 $gray $muted 'Trình duyệt (admin)' @('Next.js /admin', 'fetch REST + SSE', 'chỉ trên máy server')
Box $g 440 80 560 560 $blueSoft $blue 'server.jar (công ty)' @(
    'NioServer: 1 luồng Selector (accept/đọc/ghi)',
    '   hoặc BioServer: 1 luồng / kết nối',
    'ClientHandler: phiên, kiểm tra trạng thái,',
    '   heartbeat PING/PONG 30 s + 10 s',
    'Worker pool 16 luồng + hàng đợi tuần tự',
    '   theo từng kết nối',
    'Services: Auth · Stock · Request · Transfer',
    'Outbox: gửi ngay / hang_doi_tin / gửi lại',
    '   trạng thái sau LOGIN_OK',
    'MessageLog: ghi nhat_ky theo lô (bất đồng bộ)',
    'DiscoveryResponder: UDP :5001',
    'AdminApi + ExperimentApi: HTTP :8080',
    '   (chỉ localhost)',
    'HikariCP (20 kết nối) → JDBC')
Box $g 520 700 400 150 $amberSoft $amber 'PostgreSQL' @('phan_phoi_hang: 11 bảng', 'transaction, UPDATE có điều kiện,', 'SELECT … FOR UPDATE, UNIQUE')

$cy = @(90, 340, 590)
for ($i = 0; $i -lt 3; $i++) {
    $y = $cy[$i]
    $title = if ($i -eq 2) { 'client.jar (chi nhánh N)' } else { "client.jar (chi nhánh $($i + 1))" }
    Box $g 1180 $y 380 200 $greenSoft $green $title @('ServerLink: socket + luồng Listener', 'BranchAgent: tự gửi LOW_STOCK,', '   heartbeat, nối lại (jitter ≤ 5 s)', 'Discovery: UDP broadcast', 'HTTP :8081 → trình duyệt /branch')
}
Arrow $g 340 170 440 170 $muted 'HTTP' -both
Arrow $g 720 640 720 700 $amber 'JDBC' -both
Arrow $g 1000 170 1180 170 $blue 'TCP :5000' -both
Arrow $g 1000 420 1180 420 $blue 'TCP :5000' -both
Arrow $g 1000 680 1180 680 $blue 'TCP :5000' -both
Arrow $g 1180 318 1000 318 $green 'UDP :5001 DISCOVER/HERE' -both -dash
$g.DrawString('Giao thức dòng văn bản UTF-8: LENH|thamSo|… ≤ 4096 byte, một kết nối dùng chung cho request và push', $fs, (New-Object System.Drawing.SolidBrush $muted), 30, 865)
$bmp.Save((Join-Path $dir 'architecture.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

# ===================== Sơ đồ tuần tự =====================
$c = New-Canvas 1600 1080; $bmp = $c[0]; $g = $c[1]
$g.DrawString('Luồng cấp hàng và xử lý thiếu kho (tin trên kết nối TCP)', (New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush $ink), 30, 20)
$lanes = [ordered]@{ 'Chi nhánh A' = 170; 'Server' = 620; 'CSDL' = 980; 'Admin (UI)' = 1250; 'Chi nhánh B' = 1480 }
foreach ($k in $lanes.Keys) {
    $x = $lanes[$k]
    $sz = $g.MeasureString($k, $fb)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush $blueSoft), $x - $sz.Width / 2 - 10, 70, $sz.Width + 20, 40)
    $g.DrawString($k, $fb, (New-Object System.Drawing.SolidBrush $ink), $x - $sz.Width / 2, 78)
    $pen = New-Object System.Drawing.Pen $muted, 1.5; $pen.DashStyle = 'Dash'
    $g.DrawLine($pen, $x, 112, $x, 1050)
}
$A = $lanes['Chi nhánh A']; $S = $lanes['Server']; $D = $lanes['CSDL']; $U = $lanes['Admin (UI)']; $B = $lanes['Chi nhánh B']
$steps = @(
    @($A, $S, 'SALE|SP01|45', $blue), @($S, $D, 'UPDATE kho_chi_nhanh … RETURNING', $amber), @($S, $A, 'SALE_OK|SP01|5', $green),
    @($A, $S, 'LOW_STOCK|SP01|5|10  (tồn < ngưỡng)', $blue), @($S, $D, 'INSERT yeu_cau … ON CONFLICT DO NOTHING', $amber),
    @($S, $U, 'SSE alert → popup', $muted), @($U, $S, 'POST offer {soLuong: 30}', $muted), @($S, $A, 'OFFER|12|SP01|30', $green),
    @($A, $S, 'ACCEPT|12|30', $blue), @($S, $D, 'BEGIN; SELECT … FOR UPDATE; UPDATE kho_tong … WHERE so_luong >= 30', $amber),
    @($S, $A, 'OUT_OF_STOCK|12|8  (kho tổng không đủ)', $green), @($S, $B, 'TRANSFER_REQ|3|SP01|30|Chi nhánh A', $green),
    @($B, $S, 'TRANSFER_ACCEPT|3', $blue), @($S, $D, 'trừ kho B + YC → DA_GIAO (một transaction)', $amber),
    @($S, $B, 'TRANSFER_DONE|3|SP01|70', $green), @($S, $A, 'DELIVERED|12|SP01|30', $green),
    @($A, $S, 'RECEIVED|12', $blue), @($S, $D, 'cộng kho A, YC → HOAN_TAT', $amber), @($S, $A, 'INVENTORY|…', $green)
)
$y = 140
foreach ($st in $steps) {
    Arrow $g $st[0] $y $st[1] $y $st[3] $st[2]
    $y += 48
}
$bmp.Save((Join-Path $dir 'sequence.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "Da ve so do vao $dir"
