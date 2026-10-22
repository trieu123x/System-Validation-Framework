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
$f = New-Object System.Drawing.Font('Segoe UI', 18)
$fs = New-Object System.Drawing.Font('Segoe UI', 16)
$fb = New-Object System.Drawing.Font('Segoe UI', 20, [System.Drawing.FontStyle]::Bold)
$fm = New-Object System.Drawing.Font('Consolas', 15)
$ft = New-Object System.Drawing.Font('Segoe UI', 24, [System.Drawing.FontStyle]::Bold)
$fbs = New-Object System.Drawing.Font('Segoe UI', 17, [System.Drawing.FontStyle]::Bold)

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
    $yy = $y + 48
    foreach ($l in $lines) {
        $g.DrawString($l, $fs, (New-Object System.Drawing.SolidBrush $ink), $x + 16, $yy)
        $yy += 29
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
$g.DrawString('Kiến trúc hệ thống phân phối hàng hóa', $ft, (New-Object System.Drawing.SolidBrush $ink), 30, 20)

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
Box $g 520 700 400 150 $amberSoft $amber 'PostgreSQL' @('phan_phoi_hang: 18 bảng', 'transaction, UPDATE có điều kiện,', 'SELECT … FOR UPDATE, UNIQUE')

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
$c = New-Canvas 1600 1110; $bmp = $c[0]; $g = $c[1]
$g.DrawString('Luồng cấp hàng và xử lý thiếu kho (tin trên kết nối TCP)', $ft, (New-Object System.Drawing.SolidBrush $ink), 30, 20)
$lanes = [ordered]@{ 'Chi nhánh A' = 170; 'Server' = 620; 'CSDL' = 980; 'Admin (UI)' = 1250; 'Chi nhánh B' = 1480 }
foreach ($k in $lanes.Keys) {
    $x = $lanes[$k]
    $sz = $g.MeasureString($k, $fb)
    $g.FillRectangle((New-Object System.Drawing.SolidBrush $blueSoft), $x - $sz.Width / 2 - 10, 82, $sz.Width + 20, 42)
    $g.DrawString($k, $fb, (New-Object System.Drawing.SolidBrush $ink), $x - $sz.Width / 2, 88)
    $pen = New-Object System.Drawing.Pen $muted, 1.5; $pen.DashStyle = 'Dash'
    $g.DrawLine($pen, $x, 126, $x, 1090)
}
$A = $lanes['Chi nhánh A']; $S = $lanes['Server']; $D = $lanes['CSDL']; $U = $lanes['Admin (UI)']; $B = $lanes['Chi nhánh B']
$steps = @(
    @($A, $S, 'SALE|TB01|45', $blue), @($S, $D, 'UPDATE kho_chi_nhanh … RETURNING', $amber), @($S, $A, 'SALE_OK|TB01|5', $green),
    @($A, $S, 'LOW_STOCK|TB01|5|10  (tồn < ngưỡng)', $blue), @($S, $D, 'INSERT yeu_cau … ON CONFLICT DO NOTHING', $amber),
    @($S, $U, 'SSE alert → popup', $muted), @($U, $S, 'POST offer {soLuong: 30}', $muted), @($S, $A, 'OFFER|12|TB01|30', $green),
    @($A, $S, 'ACCEPT|12|30', $blue), @($S, $D, 'BEGIN; SELECT … FOR UPDATE; UPDATE kho_tong … WHERE so_luong >= 30', $amber),
    @($S, $A, 'OUT_OF_STOCK|12|8  (kho tổng không đủ)', $green), @($S, $B, 'TRANSFER_REQ|3|TB01|30|Chi nhánh A', $green),
    @($B, $S, 'TRANSFER_ACCEPT|3', $blue), @($S, $D, 'trừ kho B + YC → DA_GIAO (một transaction)', $amber),
    @($S, $B, 'TRANSFER_DONE|3|TB01|70', $green), @($S, $A, 'DELIVERED|12|TB01|30', $green),
    @($A, $S, 'RECEIVED|12', $blue), @($S, $D, 'cộng kho A, YC → HOAN_TAT', $amber), @($S, $A, 'INVENTORY|…', $green)
)
$y = 170
foreach ($st in $steps) {
    Arrow $g $st[0] $y $st[1] $y $st[3] $st[2]
    $y += 48
}
$bmp.Save((Join-Path $dir 'sequence.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()

# ===================== Tiện ích cho các sơ đồ báo cáo =====================
$red = [System.Drawing.Color]::FromArgb(196, 49, 43)
$redSoft = [System.Drawing.Color]::FromArgb(253, 236, 234)
$purple = [System.Drawing.Color]::FromArgb(110, 70, 190)
$purpleSoft = [System.Drawing.Color]::FromArgb(239, 237, 255)

function Title($g, $text) {
    $g.DrawString($text, $ft, (New-Object System.Drawing.SolidBrush $ink), 30, 20)
}

function Text($g, $text, $x, $y, $color, $font = $fs) {
    $g.DrawString($text, $font, (New-Object System.Drawing.SolidBrush $color), $x, $y)
}

# Mũi tên có nhãn đặt ở vị trí tuỳ ý (nền trắng để không bị đường kẻ đè)
function Arrow2($g, $x1, $y1, $x2, $y2, $color, $label, $lx, $ly, [switch]$dash) {
    $p = New-Object System.Drawing.Pen $color, 2.5
    if ($dash) { $p.DashStyle = 'Dash' }
    $p.CustomEndCap = New-Object System.Drawing.Drawing2D.AdjustableArrowCap 5, 6
    $g.DrawLine($p, $x1, $y1, $x2, $y2)
    if ($label) {
        $yy = $ly
        foreach ($l in $label.Split("`n")) {
            $sz = $g.MeasureString($l, $fs)
            $g.FillRectangle([System.Drawing.Brushes]::White, $lx - 2, $yy, $sz.Width + 4, $sz.Height)
            $g.DrawString($l, $fs, (New-Object System.Drawing.SolidBrush $color), $lx, $yy)
            $yy += 26
        }
    }
}

# Làn của sơ đồ tuần tự: hộp tên + đường kẻ đứt
function Lanes($g, $lanes, $top, $bottom) {
    foreach ($k in $lanes.Keys) {
        $x = $lanes[$k]
        $sz = $g.MeasureString($k, $fb)
        $g.FillRectangle((New-Object System.Drawing.SolidBrush $blueSoft), $x - $sz.Width / 2 - 10, $top, $sz.Width + 20, 40)
        $g.DrawString($k, $fb, (New-Object System.Drawing.SolidBrush $ink), $x - $sz.Width / 2, $top + 8)
        $pen = New-Object System.Drawing.Pen $muted, 1.5; $pen.DashStyle = 'Dash'
        $g.DrawLine($pen, $x, $top + 42, $x, $bottom)
    }
}

function Save($bmp, $g, $name) {
    $bmp.Save((Join-Path $dir $name), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}

# ===================== Vòng đời một kết nối TCP =====================
$c = New-Canvas 1600 1350; $bmp = $c[0]; $g = $c[1]
Title $g 'Vòng đời một kết nối TCP giữa chi nhánh và server (cổng 5000)'
$C = 470; $S = 1230
Lanes $g ([ordered]@{ 'Chi nhánh (client.jar)' = $C; 'Server (server.jar)' = $S }) 82 1310
$phases = @(
    @('1. Bắt tay 3 bước', 'tầng TCP (hệ điều hành)', @(@($C, $S, 'SYN', $muted), @($S, $C, 'SYN-ACK', $muted), @($C, $S, 'ACK', $muted))),
    @('2. Đăng nhập', 'tầng ứng dụng', @(@($C, $S, 'LOGIN|CN01|••••••', $blue), @($S, $C, 'LOGIN_OK|Chi nhánh Lĩnh Nam', $green),
        @($S, $C, 'tin đang chờ + trạng thái YC còn mở (OFFER, DELIVERED, NOTICE…)', $green),
        @($C, $S, 'INVENTORY_GET', $blue), @($S, $C, 'INVENTORY|TB01,Máy hút bụi…;TB02,…', $green))),
    @('3. Request và push', 'chung một kết nối', @(@($C, $S, 'SALE|TB01|2', $blue), @($S, $C, 'SALE_OK|TB01|1', $green),
        @($C, $S, 'LOW_STOCK|TB01|1|3', $blue), @($S, $C, 'DELIVERED|57|TB01|5   (push khi admin bấm Gửi hàng)', $green),
        @($C, $S, 'RECEIVED|57', $blue))),
    @('4. Heartbeat', 'im lặng 30 s', @(@($S, $C, 'PING', $green), @($C, $S, 'PONG   (phải tới trong 10 s)', $blue))),
    @('5. Đóng kết nối', 'đóng 4 bước', @(@($C, $S, 'LOGOUT', $blue), @($S, $C, 'FIN   (server đóng socket)', $muted), @($C, $S, 'ACK', $muted),
        @($C, $S, 'FIN', $muted), @($S, $C, 'ACK   → phía đóng trước (server) giữ TIME_WAIT', $muted)))
)
$y = 178
$band = 0
foreach ($ph in $phases) {
    $h = $ph[2].Count * 50 + 14
    if ($band % 2 -eq 0) { $g.FillRectangle((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(246, 248, 251))), 30, $y - 26, 1540, $h) }
    Text $g $ph[0] 40 ($y - 20) $ink $fbs
    Text $g $ph[1] 40 ($y + 10) $muted
    foreach ($st in $ph[2]) {
        Arrow $g $st[0] $y $st[1] $y $st[3] $st[2]
        $y += 50
    }
    $y += 24
    $band++
}
Text $g 'Xám: gói điều khiển TCP do hệ điều hành gửi.   Xanh dương: chi nhánh → server.   Xanh lá: server → chi nhánh.' 30 1318 $muted
Save $bmp $g 'tcp-lifecycle.png'

# ===================== Đóng khung tin trên luồng byte =====================
$c = New-Canvas 1600 760; $bmp = $c[0]; $g = $c[1]
Title $g 'TCP là luồng byte: server tự tách dòng bằng LineSplitter'
function CodeBox($g, $x, $y, $w, $text, $fill, $stroke) {
    $g.FillRectangle((New-Object System.Drawing.SolidBrush $fill), $x, $y, $w, 50)
    $g.DrawRectangle((New-Object System.Drawing.Pen $stroke, 2), $x, $y, $w, 50)
    $g.DrawString($text, (New-Object System.Drawing.Font('Consolas', 15)), (New-Object System.Drawing.SolidBrush $ink), $x + 12, $y + 12)
}
Text $g '① Chi nhánh gọi send() hai lần, mỗi lần một dòng' 40 80 $ink $fbs
CodeBox $g 40 110 330 'SALE|TB01|2\n' $blueSoft $blue
CodeBox $g 390 110 420 'LOW_STOCK|TB01|1|3\n' $blueSoft $blue
Text $g '② Mạng chuyển một luồng byte, chia đoạn tuỳ ý (không giữ ranh giới tin)' 40 210 $ink $fbs
CodeBox $g 40 240 480 'SALE|TB01|2\nLOW_ST' $amberSoft $amber
CodeBox $g 540 240 330 'OCK|TB01|1|3\n' $amberSoft $amber
Text $g 'đoạn TCP #1 (một lần read)' 40 296 $muted
Text $g 'đoạn TCP #2' 540 296 $muted
Text $g '③ LineSplitter của kết nối (bộ đệm 4096 byte) ghép lại theo ký tự \n' 40 345 $ink $fbs
Box $g 40 375 830 150 $greenSoft $green 'LineSplitter.feed(ByteBuffer)' @(
    'đọc #1 → phát dòng "SALE|TB01|2", giữ "LOW_ST" trong bộ đệm',
    'đọc #2 → nối thành "LOW_STOCK|TB01|1|3", phát dòng thứ hai',
    'dòng > 4096 byte → TOO_LONG, bỏ tới \n kế tiếp')
Arrow2 $g 455 527 455 568 $muted '' 0 0
Text $g '④ Protocol.decode → Message → ClientHandler.onLine (đúng thứ tự)' 40 572 $ink $fbs
CodeBox $g 40 607 380 'Message(SALE, [TB01, 2])' $gray $muted
CodeBox $g 440 607 430 'Message(LOW_STOCK, [TB01, 1, 3])' $gray $muted
Box $g 940 80 630 610 $purpleSoft $purple 'Quy tắc đóng khung của giao thức' @(
    '• Mỗi tin là một dòng, kết thúc bằng \n',
    '• UTF-8, tối đa 4096 byte một dòng',
    '• Dạng LENH|thamSo1|thamSo2…',
    '• Số tham số cố định theo lệnh → sai: E01',
    '',
    'Escape trong tham số:',
    '    \  →  \\        |  →  \p        xuống dòng  →  \n',
    '',
    'Danh sách trong một tham số:',
    '    bản ghi ngăn bởi ;   trường ngăn bởi ,',
    '    trong trường:  ,  →  \c      ;  →  \s',
    '',
    'Ví dụ BROADCAST có ký tự đặc biệt:',
    '    nội dung   "Giá 5|6',
    '                   giao chiều nay"',
    '    trên dây   BROADCAST|Giá 5\p6\ngiao chiều nay',
    '',
    '• Bỏ \r cuối dòng (netcat, telnet gửi CRLF)',
    '• Dòng sai không làm đóng kết nối: ERROR|E01')
Save $bmp $g 'framing.png'

# ===================== BIO và NIO =====================
$c = New-Canvas 1600 820; $bmp = $c[0]; $g = $c[1]
Title $g 'Hai mô hình I/O của server: BIO (mỗi kết nối một luồng) và NIO (một Selector)'
Text $g 'BIO – io.mode=bio' 40 80 $red $fbs
$rows = @(@('CN 1', 120), @('CN 2', 230), @('CN 3', 340), @('CN n', 480))
foreach ($r in $rows) {
    $yy = $r[1]
    $g.FillEllipse((New-Object System.Drawing.SolidBrush $redSoft), 30, $yy + 10, 70, 70)
    $g.DrawEllipse((New-Object System.Drawing.Pen $red, 2), 30, $yy + 10, 70, 70)
    Text $g $r[0] 38 ($yy + 31) $ink
    Box $g 125 $yy 300 90 $redSoft $red 'luồng đọc' @('LineReader → ClientHandler')
    Box $g 440 $yy 300 90 $redSoft $red 'luồng ghi (queued)' @('hàng đợi → write() chặn')
    Arrow2 $g 100 ($yy + 45) 123 ($yy + 45) $red '' 0 0
}
Text $g '⋮' 270 435 $muted $fb
Box $g 30 600 710 150 $gray $muted 'Đánh giá' @('2 luồng mỗi kết nối: 500 CN → 1 017 luồng (E4)', 'Mã tuần tự, dễ hiểu; ghi song song nên broadcast nhanh (E9)', 'write.mode=direct: client treo làm treo luồng gọi (E3)')
$pen = New-Object System.Drawing.Pen $muted, 2; $pen.DashStyle = 'Dash'
$g.DrawLine($pen, 770, 80, 770, 800)
Text $g 'NIO – io.mode=nio (mặc định)' 800 80 $green $fbs
for ($i = 0; $i -lt 5; $i++) {
    $yy = 125 + $i * 52
    $lbl = if ($i -eq 4) { 'CN n' } else { "CN $($i + 1)" }
    $g.FillEllipse((New-Object System.Drawing.SolidBrush $greenSoft), 800, $yy, 42, 42)
    $g.DrawEllipse((New-Object System.Drawing.Pen $green, 2), 800, $yy, 42, 42)
    Text $g $lbl 848 ($yy + 8) $ink
    Arrow2 $g 905 ($yy + 21) 958 (185) $green '' 0 0
}
Box $g 960 110 610 150 $greenSoft $green '1 luồng nio-selector' @('select() trên mọi kênh không chặn', 'OP_ACCEPT → nhận kết nối, OP_READ → đọc', 'OP_WRITE → ghi tiếp khi bộ đệm TCP rỗi')
Arrow2 $g 1265 262 1265 295 $green '' 0 0
Box $g 960 297 610 120 $blueSoft $blue 'Mỗi kết nối: LineSplitter + hàng đợi tuần tự' @('tin của một CN xử lý đúng thứ tự gửi', 'các CN khác nhau chạy song song')
Arrow2 $g 1265 419 1265 450 $blue '' 0 0
Box $g 960 452 610 120 $blueSoft $blue 'Worker pool: 16 luồng nio-worker' @('ClientHandler.onLine → services → CSDL', 'trả lời / push: ghi thẳng nếu kết nối rỗi')
Arrow2 $g 1265 574 1265 605 $blue '' 0 0
Box $g 960 607 610 150 $amberSoft $amber 'Đường ghi' @('write.through: worker tự write() khi hàng đợi rỗng', 'bộ đệm TCP đầy → giao Selector (OP_WRITE)', '> send.queue.limit tin chờ → cắt client chậm')
Text $g 'Số luồng cố định ≈ 33 dù 50 hay 1000 CN (E4, E7, E9)' 800 772 $green $fbs
Save $bmp $g 'io-models.png'

# ===================== Trạng thái yêu cầu cấp hàng =====================
$c = New-Canvas 1600 800; $bmp = $c[0]; $g = $c[1]
Title $g 'Vòng đời yêu cầu cấp hàng (yeu_cau.trang_thai) và tin giao thức gây ra chuyển trạng thái'
function State($g, $x, $y, $code, $name, $fill, $stroke) { Box $g $x $y 230 90 $fill $stroke $code @($name) }
State $g 150 300 'CHO' 'Chờ xử lý' $gray $muted
State $g 590 90 'DA_DE_XUAT' 'Đã đề xuất' $blueSoft $blue
State $g 590 520 'THIEU_HANG' 'Kho tổng không đủ' $amberSoft $amber
State $g 1030 300 'DA_GIAO' 'Đã gửi' $blueSoft $blue
State $g 1320 300 'HOAN_TAT' 'Đã nhận' $greenSoft $green
State $g 1030 620 'TU_CHOI' 'Từ chối' $redSoft $red
$g.FillEllipse((New-Object System.Drawing.SolidBrush $ink), 255, 190, 20, 20)
Arrow2 $g 265 212 265 298 $ink "LOW_STOCK hoặc`nNOTICE_REPLY" 50 210
Arrow2 $g 380 315 588 165 $blue 'admin Đề xuất' 300 238
Text $g '→ OFFER' 320 260 $blue
Arrow2 $g 380 345 1028 345 $blue 'Gửi hàng → DELIVERED' 420 352
Arrow2 $g 380 375 588 555 $amber 'admin Báo hết hàng' 250 455
Text $g '→ OUT_OF_STOCK' 270 477 $amber
Arrow2 $g 705 182 705 518 $amber 'ACCEPT, kho thiếu' 715 400
Text $g '→ OUT_OF_STOCK' 715 422 $amber
Arrow2 $g 820 150 1028 318 $blue "ACCEPT, đủ kho`n→ DELIVERED" 880 175
Arrow2 $g 820 545 1028 380 $blue "ACCEPT số còn lại hoặc`nđiều chuyển xong`n→ DELIVERED" 935 495
Arrow2 $g 1260 345 1318 345 $green 'RECEIVED' 1240 398
Arrow2 $g 820 585 1028 660 $red 'REJECT' 900 615
$pr = New-Object System.Drawing.Pen $red, 2.5; $pr.DashStyle = 'Dash'
$g.DrawLine($pr, 820, 110, 1575, 110)
$g.DrawLine($pr, 1575, 110, 1575, 665)
$pr.CustomEndCap = New-Object System.Drawing.Drawing2D.AdjustableArrowCap 5, 6
$g.DrawLine($pr, 1575, 665, 1262, 665)
Text $g 'REJECT' 1300 78 $red
Text $g 'Mọi chuyển trạng thái nằm trong một transaction có SELECT … FOR UPDATE dòng yêu cầu.' 30 735 $muted
Text $g 'uq_yeu_cau_dang_mo: mỗi (chi nhánh, mặt hàng) tối đa một YC chưa đóng; ACCEPT/RECEIVED lặp lại không đổi kho.' 30 762 $muted
Save $bmp $g 'yc-states.png'

# ===================== Gửi lại trạng thái sau khi rớt mạng =====================
$c = New-Canvas 1600 1010; $bmp = $c[0]; $g = $c[1]
Title $g 'Rút dây mạng: tin OFFER bị mất và được gửi lại từ trạng thái trong CSDL (delivery=queue_resync)'
$C = 260; $S = 820; $D = 1360
Lanes $g ([ordered]@{ 'Chi nhánh CN01' = $C; 'Server' = $S; 'CSDL' = $D }) 82 950
$y = 180
Arrow $g $S $y $D $y $amber 'yeu_cau 57 → DA_DE_XUAT (commit)'; $y += 56
Arrow $g $S $y $C $y $red 'OFFER|57|TB01|5   write() thành công nhưng gói không tới'
$g.DrawString('✗ mất', $fbs, (New-Object System.Drawing.SolidBrush $red), $C + 14, $y + 6); $y += 44
Text $g 'Server vẫn thấy CN01 online, nên không xếp tin vào hàng đợi' ($S + 20) $y $red; $y += 50
Arrow $g $S $y $C $y $muted 'PING   (im lặng 30 s)'; $y += 44
Text $g 'Không có PONG sau 10 s → server đóng phiên CN01' ($S + 20) $y $muted; $y += 50
Text $g 'Mạng có lại; chờ d(n) ≤ 5 s theo ReconnectPolicy' ($C + 14) $y $blue; $y += 64
Arrow $g $C $y $S $y $blue 'SYN … ACK, LOGIN|CN01|••••••'; $y += 56
Arrow $g $S $y $C $y $green 'LOGIN_OK|Chi nhánh Lĩnh Nam'; $y += 56
Arrow $g $S $y $D $y $amber "SELECT … WHERE ma_cn = 'CN01' AND trang_thai IN (DA_DE_XUAT, THIEU_HANG, DA_GIAO)"; $y += 56
Arrow $g $S $y $C $y $green 'OFFER|57|TB01|5   (dựng lại từ trạng thái, có thể trùng)'; $y += 56
Arrow $g $C $y $S $y $blue 'ACCEPT|57|5   (client loại trùng theo mã YC)'; $y += 56
Arrow $g $S $y $D $y $amber 'UPDATE kho_tong … WHERE so_luong >= 5; YC → DA_GIAO'; $y += 56
Arrow $g $S $y $C $y $green 'DELIVERED|57|TB01|5'; $y += 44
Text $g 'Bước gửi lại không cần biết tin nào đã tới: CSDL là nguồn sự thật, kết nối TCP chỉ là kênh truyền có thể đứt bất cứ lúc nào.' 30 968 $muted
Save $bmp $g 'resync.png'

Write-Output "Da ve so do vao $dir"
