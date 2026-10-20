export type Branch = {
  maCn: string;
  ten: string;
  diaChi: string | null;
  giaLap: boolean;
  ycMo: number;
  tinCho: number;
  online: boolean;
};

export type Product = { maSp: string; ten: string; donVi: string; gia: number; tonTong: number };

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
  soLuongDeXuat: number | null;
  soLuongChot: number | null;
  soLuongGiao: number | null;
  trangThai: string;
  taoLuc: string;
  capNhatLuc: string;
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

export type BranchItem = { maHang: string; tenHang: string; soLuong: number; nguong: number };

export type BranchRequest = {
  maYc: number;
  maHang: string;
  soLuongDeXuat: number | null;
  soLuongCoThe: number | null;
  soLuongGiao: number | null;
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

export type HistoryRow = { maYc: string; maHang: string; tenHang: string; soLuong: number; thoiGian: string; nguon: string };

export type BranchSnapshot = {
  status: "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "ONLINE";
  statusDetail: string;
  server: string;
  maCn: string | null;
  tenCn: string | null;
  inventory: BranchItem[];
  requests: BranchRequest[];
  transfers: BranchTransfer[];
  broadcasts: Notice[];
  notices: Notice[];
  history: HistoryRow[];
  historyRange: string;
  /** Mặt hàng đã tự báo thiếu (LOW_STOCK) mà yêu cầu chưa đóng. */
  daBao: string[];
};
