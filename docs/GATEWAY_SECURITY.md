# Kiem tra API qua Tailscale / Docker

## Ban sua

- `EXPERIMENT_API=false` (mac dinh) vo hieu hoa toan bo `/api/experiment/*` tren listener Admin.
- Server tra HTTP **404** cho `/api/experiment/runtime` khi API thu nghiem tat, ke ca khi chua dang nhap.
- Gateway client kiem tra `Origin` va `Host` **truoc** khi tra 401; `Origin: https://evil.example` tra **403**.
- HTTP 403 o client co log `[SECURITY] CLIENT_CSRF` hoac `[SECURITY] CLIENT_DNS_REBIND`.
- Neu khong co Origin va khong co session, request den `/api/sale` tra **401**, day la hanh vi dung.

## Cap nhat tren may Windows

```powershell
cd D:\System-Validation-Framework
# Tuyet doi khong xoa .env va database volume.
# Neu .env da co EXPERIMENT_API=true: doi thanh false.
.\scripts\docker-deploy.bat
```

`docker-deploy.bat` build lai image va recreate server/client. Neu chua cai origin cua Tailscale vao `.env`, chay `scripts\deploy-tailscale.bat` de tao `TAILSCALE_ADMIN_ORIGIN` va `TAILSCALE_CLIENT_ORIGIN` va cau hinh Funnel.

## Test qua URL Tailscale

```powershell
cd D:\System-Validation-Framework
.\scripts\test-gateway-security.ps1
```

Script doc hai URL tu `.env`. Co the truyen thu cong:

```powershell
.\scripts\test-gateway-security.ps1 -AdminOrigin 'https://your-admin.ts.net' -ClientOrigin 'https://your-admin.ts.net:8443'
```

Ket qua mong doi:

1. `GET /api/experiment/runtime` -> **404** (API thu nghiem khong lo ra cong khai).
2. `POST /api/sale` + `Origin: https://evil.example` -> **403** (CSRF).
3. `POST /api/sale` khong Origin, chua dang nhap -> **401** (auth).

Neu (2) van la **401**, kiem tra xem code moi da chay:

```powershell
docker compose ps
docker compose logs --tail 100 server client | Select-String 'EXPERIMENT_API|CLIENT_CSRF|SECURITY|server|client'
```

Sau do test lai truc tiep qua localhost (bo qua Tailscale):

```powershell
curl.exe -i -H 'Origin: https://evil.example' -X POST http://127.0.0.1:8081/api/sale
```

- Local 403, Tailscale 401: kien tra proxy co giu nguyen header Origin khong; xem `tailscale funnel status`.
- Local va Tailscale deu 401: co the dang chay image cu, hoac request khong mang header Origin den ung dung.
- Nhan `401` voi request khong co Origin khi chua dang nhap la binh thuong. `403` danh rieng cho request co Origin/Host bi cam.

**Luu y:** Tailscale Funnel la public, khac voi Tailscale Serve trong tailnet. Neu chi cho may trong tailnet truy cap, can thay Funnel bang Serve. Kiem tra HTTPS/TLS binh thuong, khong tat xac minh chung chi bang `curl -k`.

## Thuc nghiem local

API thu nghiem khong co xac thuc. `scripts/run-experiments.bat` da duoc cap nhat de bat `experiment.api=true` tren tien trinh server thu nghiem rieng. Khong bat no tren Docker dang cong khai. Neu can test thu cong, chi bat tren server co giao dien admin bound loopback va khong qua bat ky proxy cong khai nao.
