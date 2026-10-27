export type Branch = {
  maCn: string;
  ten: string;
  diaChi: string | null;
  giaLap: boolean;
  ycMo: number;
  tinCho: number;
  online: boolean;
};

export type Product = {
  maSp: string;
  ten: string;
  donVi: string;
  model: string | null;
  maDm: string;
  tenDm: string;
  giaNhap: number;
  giaXuat: number;
  giaBanLe: number;
  tonTong: number;
  anhUrl: string | null;
};

export type Category = { maDm: string; ten: string; soMatHang: number };

export type Supplier = { maNcc: string; ten: string; mst: string | null; diaChi: string | null; dienThoai: string | null };

export type RequestRow = {
  maYc: number;
  maCn: string;
  tenCn: string;
  maSp: string;
  tenSp: string;
  soLuongCon: number;
  nguong: number;
  mucThieu: number;
  goiY: number;
  tonTong: number;
  /** Giá xuất hiện tại của mặt hàng, để ước tính nợ trước khi Gửi hàng. */
  giaXuat: number;
  /** Số chi nhánh xin khi trả lời thông báo; null = YC từ LOW_STOCK. */
  soLuongXin: number | null;
  soLuongDeXuat: number | null;
  soLuongChot: number | null;
  soLuongGiao: number | null;
  soLuongNhan: number | null;
  chenhLech?: number | null;
  trangThai: string;
  taoLuc: string;
  capNhatLuc: string;
};

export type Warehouse = {
  maCn: string; ten: string; diaChi: string | null; online: boolean;
  thieu: number; sapThieu: number; du: number; chuaDat: number; giaTriTon: number; ycMo: number;
  conNo: number; hanMuc: number; vuotHanMuc: boolean;
};

export type WarehouseItem = {
  maSp: string; ten: string; model: string | null; donVi: string; maDm: string; tenDm: string; giaXuat: number;
  anhUrl: string | null; soLuong: number; nguong: number; muc: "critical" | "warning" | "ok" | "unset"; giaTri: number;
  ycMo: number | null; ycTrangThai: string | null; ban7Ngay: number; deXuat: number; tonTong: number;
};

export type WarehouseDetail = {
  maCn: string; ten: string; diaChi: string | null; online: boolean; conNo: number; hanMuc: number;
  matHang: WarehouseItem[];
};

export type SecurityEventRow = {
  id?: number; thoiGian: string; nguon: "SERVER" | "CLIENT" | "ADMIN"; loai: string; muc: "LOW" | "MEDIUM" | "HIGH";
  ip: string | null; maCn: string | null; chiTiet: string | null; hanhDong: string;
  eventKey?: string; metadata?: string | ScrapingMetadata; emailStatus?: string | null;
  review?: string | null; reviewReason?: string | null;
};

export type ScrapingMetadata = { channel?: string; resource?: string; requestCount?: number; windowSeconds?: number; riskScore?: number; action?: string; retryAfter?: number; signals?: string[] };
export type ScrapingBlock = { subject: string; expiresAt: number; reason: string };
export type SecurityOverview = {
  scraping?: { mode: string; enabled: boolean; requests: number; limited: number; alerts: number; activeBlocks: number; capacityMisses: number };
  mail?: { enabled: boolean; queued: number; sent: number; failed: number; skipped: number; rejected: number; pending: number };
  scrapingPersistence?: { pending: number; failures: number };
  ketNoi: number; tinGiay: number; ipBiChan: number; mode: "OFF" | "DETECT" | "BLOCK"; suKienBiBo: number;
  suKien24h: { high: number; medium: number; low: number };
};

export type IpRow = {
  ip: string; ketNoi: number; phienHopLe: number; tinPhut: number; loginFail: number; e01: number;
  trangThai: "BINH_THUONG" | "NGHI_VAN" | "BI_CHAN"; chanDen: string | null;
};

export type SessionRow = {
  id: number; maCn: string | null; ip: string; moLuc: string; tinVao: number; tinRa: number; tinGiay: number; lenhCuoi: string;
};

/** Sự kiện an ninh client.jar phát hiện trên máy chi nhánh (GET /api/security). */
export type ClientSecurityInfo = {
  suKien: { thoiGian: string; loai: string; muc: string; chiTiet: string }[];
  choGui: number;
  discovery: string[];
  serverDoi: string | null;
};

export type DebtState = "DA_TRA_DU" | "CON_NO" | "VUOT_HAN_MUC" | "CHUA_PHAT_SINH";

export type BranchDebt = {
  maCn: string; tenCn: string; giaLap: boolean;
  tongNhan: number; daTra: number; conNo: number; hanMuc: number; trangThai: DebtState;
};

export type SupplierDebt = { maNcc: string; ten: string; tongNhap: number; daTra: number; conNo: number };

export type DebtEntry = {
  id: number | string; loai: string; soTien: number; maYc?: number | null; maDc?: number | null;
  ghiChu: string | null; thoiGian: string;
};

export type DebtSummary = {
  tongNhap: number; daTraNcc: number; conNoNcc: number; tongXuat: number; daThuCn: number; conNoCn: number;
};

/** Tin DEBT chi nhánh nhận qua TCP (client.jar giữ bản mới nhất). */
export type BranchDebtInfo = {
  tongNhan: number; daTra: number; conNo: number; hanMuc: number; capNhat: string;
  butToan: { id: number; loai: string; soTien: number; thoiGian: string; ghiChu: string }[];
};

export type TransferRow = {
  maDc: number;
  maYc: number;
  tuCn: string;
  tenTuCn: string;
  denCn: string;
  tenDenCn: string;
  maSp: string;
  tenSp: string;
  soLuong: number;
  trangThai: string;
  taoLuc: string;
  capNhatLuc: string;
};

export type LogRow = { id?: number; maCn: string | null; chieu: string; lenh: string; noiDung: string | null; thoiGian: string };

export type Runtime = {
  threads: number;
  peakThreads: number;
  heapUsedMb: number;
  ioMode: string;
  acceptStrategy: string;
  delivery: string;
  writeMode: string;
};

export type Stats = {
  online: number;
  ketNoi: number;
  ycMo: number;
  canhBaoCho: number;
  tinPhutQua: number;
  runtime?: Runtime;
};

export type Notice = { time: string; level: string; text: string };

/** model/danhMuc/giá rỗng khi server cũ chưa gửi 4 trường mới của INVENTORY. */
export type BranchItem = {
  maHang: string;
  tenHang: string;
  soLuong: number;
  nguong: number;
  model: string;
  danhMuc: string;
  giaXuat: number | null;
  giaBanLe: number | null;
  /** Tham chiếu ảnh Cloudinary rút gọn (xem imageUrl), rỗng = chưa có ảnh. */
  anh: string;
};

export type BranchRequest = {
  maYc: number;
  maHang: string;
  soLuongDeXuat: number | null;
  soLuongCoThe: number | null;
  soLuongGiao: number | null;
  soLuongNhan: number | null;
  chenhLech?: number | null;
  trangThai: string;
  capNhat: string;
};

export type BranchTransfer = {
  maDc: number;
  maHang: string;
  soLuong: number;
  chiNhanhNhan: string;
  trangThai: string;
  capNhat: string;
};

export type HistoryRow = { maYc: string; maHang: string; tenHang: string; soLuong: number; soLuongNhan: number | null; thoiGian: string; nguon: string };

export type BranchSnapshot = {
  status: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ONLINE";
  statusDetail: string;
  server: string;
  maCn: string | null;
  tenCn: string | null;
  /** Đường dẫn trang theo tên chi nhánh ("da-nang"); null khi chưa đăng nhập. */
  slug: string | null;
  inventory: BranchItem[];
  requests: BranchRequest[];
  transfers: BranchTransfer[];
  broadcasts: Notice[];
  notices: Notice[];
  /** Thông báo có phản hồi (tin NOTICE), mới nhất trước. */
  inbox: InboxItem[];
  history: HistoryRow[];
  historyRange: string;
  /** Mặt hàng đã tự báo thiếu (LOW_STOCK) mà yêu cầu chưa đóng. */
  daBao: string[];
  /** Công nợ nhận qua tin DEBT; null khi chưa nhận (server cũ hoặc chưa đăng nhập). */
  debt: BranchDebtInfo | null;
  security: ClientSecurityInfo;
};

export type NoticeType = "TIN" | "HOI_NHU_CAU" | "SP_MOI";
export type NoticeState = "DA_GUI" | "DA_XEM" | "CAN_HANG" | "KHONG_CAN" | "MUON_NHAP" | "BO_QUA";

/** Thông báo trong hộp thư chi nhánh (client.jar). */
export type InboxItem = {
  id: number; loai: NoticeType; trangThai: NoticeState; taoLuc: string; tieuDe: string; noiDung: string;
  maSp: string; deXuat: number | null; soLuong: number | null; maYc: number | null; anh: string;
};

/** Thông báo phía admin kèm thống kê phản hồi. */
export type NoticeRow = {
  id: number; loai: NoticeType; tieuDe: string; noiDung: string; maSp: string | null; tenSp: string | null;
  anhUrl: string | null; soLuongDeXuat: number | null; taoLuc: string;
  tong: number; daXem: number; dongY: number; tuChoi: number; tongSoLuong: number;
};

export type NoticeDetail = NoticeRow & {
  chiNhanh: {
    maCn: string; tenCn: string; trangThai: NoticeState; deXuat: number | null; soLuong: number | null;
    maYc: number | null; ycTrangThai: string | null; xemLuc: string | null; traLoiLuc: string | null;
  }[];
};

/** (CN, SP) sắp chạm ngưỡng, chưa có YC mở: gợi ý gửi "Hỏi nhu cầu". */
export type NoticeSuggestion = {
  maCn: string; tenCn: string; maSp: string; tenSp: string; soLuong: number; nguong: number;
  muc: "critical" | "warning"; deXuat: number;
};
