# Run inside D:\Flood_detection . Creates UNVERIFIED dry/wet/reflection frame candidates.
# This script does NOT approve training labels and does NOT start training.
$ErrorActionPreference = 'Stop'
$py = '.\.venv\Scripts\python.exe'
$data = 'data\finetune\stage11'
if (-not (Test-Path "$data\samples.csv")) {
    & $py -m training.stage11_data import-parepare `
      --manifest data\evaluation\parepare\manifest.json `
      --output $data --confirm-mapping YES
    if ($LASTEXITCODE -ne 0) { throw 'Parepare import failed' }
}
$videos = @(
    @{name='road_01'; group='pexels_road01_dry'; condition='dry_shadow_candidate'; split='train'},
    @{name='road_02'; group='pexels_road02_wet'; condition='wet_no_flood_candidate'; split='val'},
    @{name='road_03'; group='pexels_road03_reflection'; condition='reflection_candidate'; split='test'}
)
foreach ($v in $videos) {
    $file = "data\evaluation\stage9\videos\$($v.name).mp4"
    if (-not (Test-Path $file)) {
        Write-Warning "Video missing: $file"
        continue
    }
    & $py -m training.stage11_data extract-candidates `
      --video $file --source-id $v.group --condition $v.condition `
      --split $v.split --output $data --interval 3 --duration 60 --max-frames 20
    if ($LASTEXITCODE -ne 0) { throw "Failed: $file" }
}
& $py -m training.stage11_data review-sheets --csv "$data\samples.csv"
if ($LASTEXITCODE -ne 0) { throw 'Review sheet generation failed' }
Write-Host 'Review candidates and set verified=1 ONLY when the empty water mask is truthful.'
Write-Host "CSV: $data\samples.csv"
Write-Host "Contact sheets: $data\review_sheets"
