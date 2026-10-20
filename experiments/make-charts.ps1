# Ve bieu do ket qua thuc nghiem tu cac file CSV trong experiments/results (Windows PowerShell 5.1, .NET Chart).
# Chay: powershell -ExecutionPolicy Bypass -File experiments\make-charts.ps1
Add-Type -AssemblyName System.Windows.Forms.DataVisualization
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$res = Join-Path $root 'results'
$out = Join-Path $root 'charts'
New-Item -ItemType Directory -Force $out | Out-Null

$blue = [System.Drawing.Color]::FromArgb(36, 99, 235)
$red = [System.Drawing.Color]::FromArgb(196, 49, 43)
$green = [System.Drawing.Color]::FromArgb(26, 127, 75)
$gray = [System.Drawing.Color]::FromArgb(150, 158, 170)
$font = New-Object System.Drawing.Font('Segoe UI', 11)
$titleFont = New-Object System.Drawing.Font('Segoe UI', 13, [System.Drawing.FontStyle]::Bold)

function New-Chart([string]$title) {
    $c = New-Object System.Windows.Forms.DataVisualization.Charting.Chart
    $c.Width = 1400; $c.Height = 620
    $c.BackColor = [System.Drawing.Color]::White
    $t = $c.Titles.Add($title); $t.Font = $titleFont
    $lg = New-Object System.Windows.Forms.DataVisualization.Charting.Legend
    $lg.Docking = 'Bottom'; $lg.Font = $font; $c.Legends.Add($lg)
    return $c
}

function Add-Area($chart, [string]$name, [string]$ytitle, [float]$x, [float]$w) {
    $a = New-Object System.Windows.Forms.DataVisualization.Charting.ChartArea $name
    $a.AxisX.LabelStyle.Font = $font; $a.AxisY.LabelStyle.Font = $font
    $a.AxisY.Title = $ytitle; $a.AxisY.TitleFont = $font
    $a.AxisX.MajorGrid.Enabled = $false
    $a.AxisY.MajorGrid.LineColor = [System.Drawing.Color]::FromArgb(230, 230, 230)
    $a.AxisX.Interval = 1
    $a.Position.Auto = $false; $a.Position.X = $x; $a.Position.Y = 8; $a.Position.Width = $w; $a.Position.Height = 78
    $chart.ChartAreas.Add($a)
    return $a
}

function Add-Bars($chart, [string]$area, [string]$name, $labels, $values, $color, [string]$fmt = '#,0.##') {
    $s = New-Object System.Windows.Forms.DataVisualization.Charting.Series $name
    $s.ChartType = 'Column'; $s.ChartArea = $area; $s.Color = $color
    $s.IsValueShownAsLabel = $true; $s.LabelFormat = $fmt; $s.Font = $font
    for ($i = 0; $i -lt $labels.Count; $i++) { [void]$s.Points.AddXY([object]([string]$labels[$i]), [object[]]@([double]$values[$i])) }
    $chart.Series.Add($s)
}

function Add-Line($chart, [string]$area, [string]$name, $xs, $ys, $color) {
    $s = New-Object System.Windows.Forms.DataVisualization.Charting.Series $name
    $s.ChartType = 'Line'; $s.ChartArea = $area; $s.Color = $color; $s.BorderWidth = 3
    $s.MarkerStyle = 'Circle'; $s.MarkerSize = 9; $s.IsValueShownAsLabel = $true; $s.Font = $font
    for ($i = 0; $i -lt $xs.Count; $i++) { [void]$s.Points.AddXY([object]([string]$xs[$i]), [object[]]@([double]$ys[$i])) }
    $chart.Series.Add($s)
}

function Avg($rows, $col) { ($rows | Measure-Object -Property $col -Average).Average }

# ---------- E1 ----------
$e1 = Import-Csv (Join-Path $res 'e1_accept_contention.csv')
$strats = @('CHECK_THEN_ACT', 'SYNCHRONIZED', 'CONDITIONAL')
$c = New-Chart 'E1 – 50 chi nhánh cùng ACCEPT 8, kho tổng 200 (trung bình 5 lần)'
[void](Add-Area $c 'a' 'Đơn vị hàng' 2 47)
[void](Add-Area $c 'b' 'ms' 52 47)
$ship = $strats | ForEach-Object { $s = $_; Avg ($e1 | Where-Object chien_luoc -eq $s) 'tong_xuat' }
$lat = $strats | ForEach-Object { $s = $_; Avg ($e1 | Where-Object chien_luoc -eq $s) 'makespan_ms' }
Add-Bars $c 'a' 'Tổng xuất kho (đúng = 200)' $strats $ship $red
Add-Bars $c 'a' 'Tồn kho đầu' $strats @(200, 200, 200) $gray
Add-Bars $c 'b' 'Thời gian xong cả loạt 50 ACCEPT (ms)' $strats $lat $blue
$c.SaveImage((Join-Path $out 'e1_accept.png'), 'Png')

# ---------- E2 ----------
$e2 = Import-Csv (Join-Path $res 'e2_push_reliability.csv')
$c = New-Chart 'E2 – Tỉ lệ OFFER bị mất khi chi nhánh mất kết nối (30 CN, 60 s)'
[void](Add-Area $c 'a' '% OFFER bị mất' 2 96)
Add-Bars $c 'a' 'Tỉ lệ mất (%)' @('NONE (không giữ tin)', 'QUEUE (theo SRS)', 'QUEUE_RESYNC (đề xuất)') ($e2 | ForEach-Object ti_le_mat_pct) $red '0.0'
$c.SaveImage((Join-Path $out 'e2_delivery.png'), 'Png')

# ---------- E3 ----------
$e3 = Import-Csv (Join-Path $res 'e3_slow_consumer.csv')
$names = @('BIO + ghi trực tiếp', 'BIO + hàng đợi gửi', 'NIO + hàng đợi gửi')
$c = New-Chart 'E3 – Tin broadcast tới 20 chi nhánh bình thường khi có 1 chi nhánh treo (tối đa 6000)'
[void](Add-Area $c 'a' 'Số tin nhận được' 2 96)
Add-Bars $c 'a' 'Tin tới CN bình thường' $names ($e3 | ForEach-Object tin_toi_cn_binh_thuong) $blue
$c.SaveImage((Join-Path $out 'e3_slow_consumer.png'), 'Png')

# ---------- E4 ----------
$e4 = Import-Csv (Join-Path $res 'e4_bio_vs_nio.csv')
$bio = $e4 | Where-Object server -eq 'bio'
$nio = $e4 | Where-Object server -eq 'nio'
$c = New-Chart 'E4 – BIO và NIO khi tăng số client (1 SALE/giây mỗi client)'
[void](Add-Area $c 'a' 'Số luồng JVM của server (đỉnh)' 2 47)
[void](Add-Area $c 'b' 'Độ trễ p95 SALE (ms)' 52 47)
Add-Line $c 'a' 'BIO – số luồng' ($bio | ForEach-Object so_client) ($bio | ForEach-Object luong_dinh) $red
Add-Line $c 'a' 'NIO – số luồng' ($nio | ForEach-Object so_client) ($nio | ForEach-Object luong_dinh) $green
Add-Line $c 'b' 'BIO – p95' ($bio | ForEach-Object so_client) ($bio | ForEach-Object p95_ms) $red
Add-Line $c 'b' 'NIO – p95' ($nio | ForEach-Object so_client) ($nio | ForEach-Object p95_ms) $green
$c.ChartAreas['a'].AxisX.Title = 'Số client'; $c.ChartAreas['b'].AxisX.Title = 'Số client'
$c.SaveImage((Join-Path $out 'e4_bio_nio.png'), 'Png')

# ---------- E5 ----------
$e5 = Import-Csv (Join-Path $res 'e5_reconnect_storm.csv')
$pol = @('fixed', 'backoff', 'jitter')
$polLabel = @('Cố định 5 s', 'Backoff + jitter', 'Jitter lệch pha')
$c = New-Chart 'E5 – 300 chi nhánh nối lại khi server khởi động lại (trung bình 5 lần)'
[void](Add-Area $c 'a' 'ms' 2 31)
[void](Add-Area $c 'b' 'Lần thử / 100 ms' 35 31)
[void](Add-Area $c 'c' 'Lần thử / client' 68 31)
$avgT = $pol | ForEach-Object { $p = $_; Avg ($e5 | Where-Object chinh_sach -eq $p) 'tb_ms' }
$peak = $pol | ForEach-Object { $p = $_; Avg ($e5 | Where-Object chinh_sach -eq $p) 'dinh_moi_100ms' }
$att = $pol | ForEach-Object { $p = $_; (Avg ($e5 | Where-Object chinh_sach -eq $p) 'so_lan_thu') / 300 }
Add-Bars $c 'a' 'Thời gian nối lại TB (ms)' $polLabel $avgT $blue '#,0'
Add-Bars $c 'b' 'Đỉnh lần thử / 100 ms' $polLabel $peak $red '#,0.#'
Add-Bars $c 'c' 'Số lần thử / client' $polLabel $att $gray '0.00'
$c.SaveImage((Join-Path $out 'e5_reconnect.png'), 'Png')

Write-Output "Da ve bieu do vao $out"
