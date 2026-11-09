# Run from D:\Flood_detection after dataset preparation and label review.
$ErrorActionPreference = 'Stop'
if (-not (Test-Path 'data\finetune\stage11\samples.csv')) { throw 'Stage11 dataset not found.' }
if (-not (Test-Path 'models\riwa_unet_resnet34_deploy.pth')) { throw 'RIWA model not found.' }
$dest = 'stage11_kaggle_bundle.zip'
Compress-Archive -Path training, data\finetune\stage11, models\riwa_unet_resnet34_deploy.pth `
  -DestinationPath $dest -CompressionLevel Optimal -Force
Write-Host "Upload as a Kaggle dataset: $dest"
