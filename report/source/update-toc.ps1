# Cập nhật mục lục, danh mục hình/bảng của báo cáo bằng Word (docx-js chỉ chèn trường rỗng), rồi xuất PDF nếu cần.
# Chạy: powershell -ExecutionPolicy Bypass -File report\source\update-toc.ps1 [-Docx <đường dẫn>] [-Pdf <đường dẫn>]
param(
    [string]$Docx = (Join-Path (Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)) 'NhomXX_PhanPhoiHangHoa_Report.docx'),
    [string]$Pdf = ''
)
$Docx = (Resolve-Path $Docx).Path
# Word tự hiểu đường dẫn tương đối theo thư mục của nó (thường là Documents), nên đổi sang đường dẫn tuyệt đối
if ($Pdf) { $Pdf = [IO.Path]::GetFullPath((Join-Path (Get-Location) $Pdf)) }
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
    $d = $word.Documents.Open($Docx)
    # Hai lượt: lượt đầu điền danh mục làm số trang thay đổi, lượt sau cập nhật lại số trang
    for ($i = 0; $i -lt 2; $i++) {
        foreach ($toc in $d.TablesOfContents) { $toc.Update() }
        $d.Fields.Update() | Out-Null
    }
    $d.Save()
    Write-Output ("Trang: " + $d.ComputeStatistics(2) + ", tu: " + $d.ComputeStatistics(0))
    if ($Pdf) {
        $d.ExportAsFixedFormat($Pdf, 17)
        Write-Output "Da xuat $Pdf"
    }
    $d.Close()
} finally {
    $word.Quit()
}
