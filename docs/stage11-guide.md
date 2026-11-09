# Stage 11 - Fine-tune RIWA, khong train lai tu dau

## 0. Muc tieu

- Giam nhan nham bong cay, duong kho, mat duong uot va anh den thanh nuoc.
- Giu kha nang nhan dien nuoc that tu cac anh co mask duoc gan nhan.
- Khong chon ROI bang tay trong web, khong ghi de checkpoint goc.
- Van can nhan du lieu duoc kiem tra cho TRAIN/EVALUATION. Hoat dong web ve sau khong can nguoi dung gan nhan.
- **Chua giai quyet phan loai nguy co do sau ngap**: nuoc tren duong khong dong nghia duong ngap nguy hiem.

## 1. Trinh tu du lieu

Dataset nhan nuoc co 680 cap anh/mask trong `data/evaluation/parepare`:

| source_id | so anh | split de xuat |
| --- | ---: | --- |
| KM 3 Jl. Jendral | 110 | train |
| Perbatasan Parepare1 | 188 | train |
| Jl. Lasinrang | 130 | train |
| SMK 1 Lumpue | 175 | val |
| Jl Abu Bakar Lambogo | 77 | test (da xem benchmark, chi mang tinh tham khao) |

**Canh bao:** Khong biet tap train goc cua RIWA co trung voi Parepare hay khong. Khong duoc coi day la benchmark doc lap de tuyen bo tong quat hoa. Mask Parepare duoc convert theo palette da dung trong benchmark: RGB `[51,221,255]` la nuoc, `[0,0,0]` bo qua, mau khac la nen/khong nuoc. **Kiem tra palette bang mat truoc khi train** de dam bao nha cung cap dataset dung nhan nhu vay.

Mo PowerShell tai `D:\\Flood_detection`, giai nen patch sao cho co thu muc `training` ngay trong project, sau do:

```powershell
.\.venv\Scripts\python.exe -m training.stage11_data import-parepare `
  --manifest data\evaluation\parepare\manifest.json `
  --output data\finetune\stage11 `
  --confirm-mapping YES
```

Lenh tren TAO dataset huan luyen rieng (khong thay doi du lieu goc) va file `data/finetune/stage11/samples.csv`.

## 2. Trich anh ung vien am tinh tu video GOC

**Khong** dung video diagnostic co overlay mau. Su dung video MP4 goc `road_01.mp4`, `road_02.mp4`, ... da tai. Cong cu tao mask rong de xem xet, nhung **mac dinh `verified=0`**, hoan toan KHONG duoc dung de train cho toi khi ban xem anh va xac nhan khong co nuoc nhin thay.

```powershell
.\.venv\Scripts\python.exe -m training.stage11_data extract-candidates `
  --video data\evaluation\stage9\videos\road_01.mp4 `
  --source-id pexels_road01_dry `
  --condition dry_shadow `
  --split train `
  --interval 3 --duration 60 --max-frames 20

.\.venv\Scripts\python.exe -m training.stage11_data extract-candidates `
  --video data\evaluation\stage9\videos\road_02.mp4 `
  --source-id pexels_road02_wet `
  --condition wet_no_flood_candidate `
  --split val `
  --interval 3 --duration 60 --max-frames 20

.\.venv\Scripts\python.exe -m training.stage11_data extract-candidates `
  --video data\evaluation\stage9\videos\road_03.mp4 `
  --source-id pexels_road03_night `
  --condition reflection_candidate `
  --split test `
  --interval 3 --duration 60 --max-frames 20
```

Chu y: cac video tren co the co vung nuoc that. **Neu anh co vòng nuoc/vung nuoc that:** khong duoc chuyen `verified=1` voi mask rong; phai tao mask nuoc that hoac de `verified=0` de bo qua. 'Duong uot nhung chua ngap nguy hiem' **khong** dong nghia mask nuoc rong neu co vung nuoc nhin thay.

Mo thu muc `data/finetune/stage11/images`, kiem tra tung frame ung vien. Sua cot `verified` trong `samples.csv` thanh `1` CHI CHO anh va mask da duoc kiem tra dung. Khong doi `source_id` cua cac anh cung video hoac cheo split.

Nen co video am tinh doc lap trong validation. Neu chua co: tool validation va training theo mac dinh se tu choi nghiem thu, vi khong the xac minh false positive.

## 3. Xac minh du lieu

```powershell
.\.venv\Scripts\python.exe -m training.stage11_data validate `
  --csv data\finetune\stage11\samples.csv `
  --require-val-negatives
```

Tool kiem tra mask 0 (non-water), 1 (water), 255 (ignore), kich thuoc mask, trung anh, va `source_id` khong xuat hien trong nhieu split.

## 4. Kiem tra checkpoint truoc khi train

```powershell
.\.venv\Scripts\python.exe -m training.stage11_finetune `
  --csv data\finetune\stage11\samples.csv `
  --checkpoint models\riwa_unet_resnet34_deploy.pth `
  --dry-run
```

Can `torch + torchvision` tren cung environment ma project dang chay; khong can segmentation_models_pytorch. Lenh dry-run **KHONG** huan luyen.

## 5. Fine-tune tren Windows RTX 2050

```powershell
.\.venv\Scripts\python.exe -m training.stage11_finetune `
  --csv data\finetune\stage11\samples.csv `
  --checkpoint models\riwa_unet_resnet34_deploy.pth `
  --output outputs\stage11_train `
  --batch-size 2 `
  --epochs 30 `
  --patience 7 `
  --lr 0.00008 `
  --workers 0
```

Neu GPU bao CUDA out-of-memory, thu `--batch-size 1`. Train su dung loss BCE + Dice, AdamW, augment mau/lat anh, AMP neu CUDA, early stopping tren validation. `negative-sampling-fraction 0.35` giup khong bo qua duong kho neu so anh am tinh it.

Outputs:

- `outputs/stage11_train/riwa_finetuned_candidate.pth` (KHONG la model san sang deploy)
- `outputs/stage11_train/training_report.json`
- `outputs/stage11_train/history.csv`

## 6. Danh gia 2 checkpoints tren cung tap validation

```powershell
.\.venv\Scripts\python.exe -m training.stage11_evaluate `
  --csv data\finetune\stage11\samples.csv `
  --original models\riwa_unet_resnet34_deploy.pth `
  --candidate outputs\stage11_train\riwa_finetuned_candidate.pth `
  --split val `
  --output outputs\stage11_compare
```

Khong sua `MODEL_BACKEND` hay overwrite `models/riwa_unet_resnet34_deploy.pth`. Neu candidate tot hon tren validation, can kiem thu video duong kho/ngap THUC va nhan doc lap tren video moi, sau do moi can nhac tiep nhan.

## 7. Kaggle GPU

- Dong goi **thu muc `training/`**, `data/finetune/stage11/`, va file `models/riwa_unet_resnet34_deploy.pth` thanh dataset zip rieng. Khong can upload project app/ hoac cache.
- Add dataset zip vao Kaggle Input; GPU T4 (hoac GPU duoc cap), Internet OFF neu du lieu da add Input.
- Vi du dataset mount o `/kaggle/input/stage11-bundle/stage11_bundle.zip`:

```python
import zipfile, pathlib, subprocess, sys
bundle='/kaggle/input/stage11-bundle/stage11_bundle.zip'
with zipfile.ZipFile(bundle) as z:
    z.extractall('/kaggle/working')
cmd=[sys.executable,'-m','training.stage11_finetune',
     '--csv','data/finetune/stage11/samples.csv',
     '--checkpoint','models/riwa_unet_resnet34_deploy.pth',
     '--output','outputs/stage11_train',
     '--batch-size','4','--epochs','30','--patience','7']
subprocess.run(cmd,cwd='/kaggle/working',check=True)
```

- Chon tai ket qua `outputs/stage11_train/riwa_finetuned_candidate.pth`, `training_report.json`, va `history.csv`.
- **Khong** dua video diagnostic vao tap train; mask phai co ground truth.

## 8. Quan trong ve mot so loi

- `ValueError: Validation needs a separate, verified non-water source`: chua co video negative duoc xac nhan cho validation. Day la dung de tranh tuning mu.
- `No verified val images`: khong du du lieu de early stop.
- `Expected RIWA deploy checkpoint`: file duoc chon khong phai checkpoint goc RIWA.
- GPU training nang: giam `--batch-size`, giu image size 384 de tuong thich app.
- Kich thuoc model khong thay doi, API web chua bi cham toi. De dang rollback.

## 9. Viec can gui sau train

Gui 3 file: `training_report.json`, `history.csv`, `outputs/stage11_compare/comparison.json`. Neu co video diagnostic so sanh baseline/candidate tren cung camera thi gui them.

**Gioi han:** stage11 chi huan luyen segmentation; khong tu dong phan biet 'co nuoc' voi 'duong ngap nguy hiem'. Giai doan tiep theo can label su kien flood theo thoi gian va do do tin cay canh bao tren duong thuong.
