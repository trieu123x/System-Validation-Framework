// Giả lập log demo, không cần server.jar hay PostgreSQL thật:
//   1) in CSDL ban đầu, 2) N chi nhánh ảo cùng kết nối và gửi yêu cầu (kèm tình trạng mạng),
//   3) server xử lý từng yêu cầu, 4) in CSDL sau khi xử lý và kiểm tra tính đúng.
// Lệnh và tham số bám theo giao thức thật (common/Command.java), bảng bám theo db/schema.sql.
// Số liệu sinh ngẫu nhiên có seed nên chạy lại ra y hệt. Xem tham số: node scripts/sim-log.js --help
'use strict';

const fs = require('fs');

// ---------- tham số dòng lệnh ----------
const args = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
}
if (args.help) {
  console.log([
    'Giả lập log: CSDL ban đầu -> N chi nhánh gửi yêu cầu (tình trạng mạng) -> server xử lý -> CSDL sau xử lý.',
    'Không kết nối server hay PostgreSQL thật.',
    '',
    '  --clients=1000   số chi nhánh ảo (1..9999)',
    '  --speed=1        tốc độ phát log (2 = nhanh gấp đôi, 0 = in ngay không chờ)',
    '  --seed=20261021  đổi seed để ra kịch bản khác',
    '  --verbose        in mọi sự kiện thay vì lấy mẫu',
    '  --log=file.log   ghi thêm bản không màu ra file',
    '  --no-color       tắt màu ANSI',
    '',
    'Chạy thật với server.jar và PostgreSQL thật (cần db/seed_loadsim.sql và psql):',
    '  --real               bật chế độ chạy thật (--clients tối đa 1000)',
    '  --start-server       tự bật server.jar (max.clients đủ lớn) ở cổng 5100/8180, tắt khi xong',
    '  --host=127.0.0.1     máy server; --port=5000 --admin-port=8080 khi dùng server đang chạy',
    '  --product=SP05       mặt hàng dùng để thử; --ship=10 số lượng mỗi lần "Gửi hàng"',
    '  --admin-user=admin --admin-password=admin123 --branch-password=123456',
    '  --psql=đường_dẫn     psql.exe (mặc định tìm trong C:\\Program Files\\PostgreSQL\\*\\bin)',
    '  --keep               không dọn dữ liệu của lượt chạy',
  ].join('\n'));
  process.exit(0);
}
const N = Math.min(args.real ? 1000 : 9999, Math.max(1, parseInt(args.clients, 10) || 1000));
const SPEED = args.speed === undefined ? 1 : Math.max(0, Number(args.speed) || 0);
const SEED = parseInt(args.seed, 10) || 20261021;
const VERBOSE = !!args.verbose;
const LOG_FILE = typeof args.log === 'string' ? args.log : null;
const COLOR = !args['no-color'] && !process.env.NO_COLOR && process.stdout.isTTY;

// ---------- in ấn ----------
const paint = code => s => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const C = {
  bold: paint('1'), dim: paint('2'), red: paint('31'), green: paint('32'), yellow: paint('33'),
  blue: paint('34'), magenta: paint('35'), cyan: paint('36'), gray: paint('90'),
};
const strip = s => String(s).replace(/\x1b\[[0-9;]*m/g, '');
const fileLines = LOG_FILE ? [] : null;
function out(s = '') {
  process.stdout.write(s + '\n');
  if (fileLines) fileLines.push(strip(s));
}
const sleep = ms => (SPEED > 0 ? new Promise(r => setTimeout(r, ms / SPEED)) : Promise.resolve());

const nf = n => Math.round(n).toLocaleString('vi-VN');
const fmtMs = x => (x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : String(Math.round(x))) + ' ms';
const kb = b => (b / 1024).toFixed(1) + ' KB';
const bar = (f, w = 20) => {
  const k = Math.round(Math.min(1, f) * w);
  return C.green('█'.repeat(k)) + C.gray('░'.repeat(w - k));
};
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
function pct(a, p) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

// ---------- bảng kiểu psql ----------
const width = s => [...strip(s).normalize('NFC')].length;
const padEnd = (s, w) => s + ' '.repeat(Math.max(0, w - width(s)));
const padStart = (s, w) => ' '.repeat(Math.max(0, w - width(s))) + s;
function table(head, rows, right = []) {
  const cells = rows.map(r => r.map(v => (v === null || v === undefined ? '' : String(v))));
  const w = head.map((h, i) => Math.max(width(h), ...cells.map(r => width(r[i]))));
  out(' ' + head.map((h, i) => {
    const sp = w[i] - width(h);
    return ' '.repeat(sp >> 1) + h + ' '.repeat(sp - (sp >> 1));
  }).join(' | '));
  out(w.map(x => '-'.repeat(x + 2)).join('+'));
  for (const r of cells) out(' ' + r.map((v, i) => (right.includes(i) ? padStart(v, w[i]) : padEnd(v, w[i]))).join(' | '));
  out(`(${rows.length} ${rows.length === 1 ? 'row' : 'rows'})`);
  out();
}
const sql = q => out(C.green('phan_phoi_hang=#') + ' ' + C.bold(q));
const note = s => out(C.gray('-- ' + s));

// ---------- RNG có seed (mulberry32) ----------
let seedState = SEED >>> 0;
function rand() {
  seedState = (seedState + 0x6d2b79f5) >>> 0;
  let t = seedState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));
const uniform = (a, b) => a + rand() * (b - a);
function gauss() {
  let u = 0;
  while (!u) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

// ---------- đồng hồ ảo + hàng đợi sự kiện ----------
const T0 = Date.now();
let vt = 0; // ms kể từ T0
const p2 = n => String(n).padStart(2, '0');
function clock(t = vt) {
  const d = new Date(T0 + t);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}
function stamp(t) {
  const d = new Date(T0 + t);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${clock(t)}`;
}
const T = () => C.gray(`[${clock(args.real ? Date.now() - T0 : vt)}]`);
const INDENT = ' '.repeat(15);

const heap = [];
let evSeq = 0;
const evLess = (a, b) => a.t < b.t || (a.t === b.t && a.s < b.s);
function at(t, fn) {
  const e = { t, s: evSeq++, fn };
  heap.push(e);
  for (let i = heap.length - 1; i > 0;) {
    const p = (i - 1) >> 1;
    if (!evLess(heap[i], heap[p])) break;
    [heap[i], heap[p]] = [heap[p], heap[i]];
    i = p;
  }
}
function popEv() {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    for (let i = 0; ;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < heap.length && evLess(heap[l], heap[m])) m = l;
      if (r < heap.length && evLess(heap[r], heap[m])) m = r;
      if (m === i) break;
      [heap[i], heap[m]] = [heap[m], heap[i]];
      i = m;
    }
  }
  return top;
}
// Chạy hết sự kiện, cứ mỗi tickMs thời gian ảo thì gọi onTick rồi chờ realMs thời gian thật
async function run(tickMs, realMs, onTick) {
  let end = vt + tickMs;
  while (heap.length) {
    while (heap.length && heap[0].t <= end) {
      const e = popEv();
      vt = e.t;
      e.fn();
    }
    vt = end;
    onTick(tickMs);
    await sleep(realMs);
    end += tickMs;
  }
}

// ---------- dữ liệu ban đầu ----------
const SP = [
  { ma: 'SP01', ten: 'Nước suối 500ml', dv: 'chai', gia: 5000, heSo: 2.0 },
  { ma: 'SP02', ten: 'Mì gói', dv: 'gói', gia: 4000, heSo: 1.4 },
  { ma: 'SP03', ten: 'Sữa tươi 1L', dv: 'hộp', gia: 32000, heSo: 0.9 },
  { ma: 'SP04', ten: 'Gạo 5kg', dv: 'bao', gia: 120000, heSo: 0.5 },
  { ma: 'SP05', ten: 'Dầu ăn 1L', dv: 'chai', gia: 55000, heSo: 1.2 },
];
const spByMa = Object.fromEntries(SP.map(s => [s.ma, s]));
// Mỗi CN xin trung bình ~24,5 đơn vị một mặt hàng → nhu cầu mỗi SP ≈ 4,9·N.
// heSo < 1 làm kho tổng thiếu, để luôn có nhánh "Báo hết hàng".
const step = N >= 200 ? 100 : 10;
const khoTong = {};
for (const s of SP) khoTong[s.ma] = Math.max(step, Math.round((4.9 * N * s.heSo) / step) * step);
const khoTong0 = { ...khoTong };

const PROFILES = [
  { ten: 'LAN', ti: 0.55, rtt: [0.4, 3], jitter: 0.4, loss: 0.002, reset: 0.001 },
  { ten: 'WAN', ti: 0.35, rtt: [8, 35], jitter: 5, loss: 0.008, reset: 0.004 },
  { ten: '4G', ti: 0.10, rtt: [45, 140], jitter: 30, loss: 0.03, reset: 0.03 },
];
for (const p of PROFILES) Object.assign(p, { n: 0, rtts: [], hs: [], seg: 0, lost: 0, synRetry: 0, resets: 0 });
function makeIp(p) {
  if (p.ten === 'LAN') return `192.168.${randInt(1, 20)}.${randInt(2, 254)}`;
  if (p.ten === 'WAN') return `113.160.${randInt(0, 255)}.${randInt(1, 254)}`;
  return `27.72.${randInt(0, 255)}.${randInt(1, 254)}`;
}

const clients = [];
for (let i = 1; i <= N; i++) {
  const r = rand();
  const p = r < PROFILES[0].ti ? PROFILES[0] : r < PROFILES[0].ti + PROFILES[1].ti ? PROFILES[1] : PROFILES[2];
  p.n++;
  const sp = SP[randInt(0, SP.length - 1)].ma;
  const kho = {};
  for (const s of SP) kho[s.ma] = s.ma === sp ? randInt(12, 20) : randInt(30, 80);
  clients.push({
    i, p, sp, kho, kho0: { ...kho },
    // như seed_loadsim.sql: SIM001..SIM999, SIM1000
    ma: 'SIM' + String(i).padStart(3, '0'),
    ten: 'Chi nhánh ảo ' + i,
    ip: makeIp(p), port: randInt(49152, 65535),
    baseRtt: uniform(p.rtt[0], p.rtt[1]),
    nguong: 10,
    ban: kho[sp] - randInt(2, 9), // bán xuống còn 2..9, dưới ngưỡng 10
    synTries: 0, wasReset: false, replies: 0,
    traced: i <= 2 || (N >= 40 && i % Math.floor(N / 4) === 0),
  });
}
const first4G = clients.find(c => c.p.ten === '4G');
if (first4G) first4G.traced = true;
const sampleRtt = c => c.baseRtt + Math.abs(gauss()) * c.p.jitter;

// trạng thái "CSDL"
const yeuCau = [];
const phieuXuat = [];
const banHang = [];
const nhatKy = [];
const nkBuf = [];
const NK_BATCH = 2000;
let nkLastFlush = 0;
let nkBatches = 0;
let msgCount = 0;
function flushNhatKy(force) {
  while (nkBuf.length >= NK_BATCH || ((force || vt - nkLastFlush >= 500) && nkBuf.length)) {
    const batch = nkBuf.splice(0, NK_BATCH);
    for (const r of batch) {
      r.id = nhatKy.length + 1;
      nhatKy.push(r);
    }
    nkBatches++;
    nkLastFlush = vt;
    out(`${T()} ${C.gray('[nhat_ky]')} ghi lô ${nf(batch.length)} dòng (batch insert, reWriteBatchedInserts=true) ` +
      `${fmtMs(5 + batch.length * 0.011)} · tổng ${nf(nhatKy.length)} dòng`);
  }
}
function rowCounts() {
  return {
    chi_nhanh: N, san_pham: SP.length, kho_tong: SP.length, kho_chi_nhanh: N * SP.length,
    yeu_cau: yeuCau.length, phieu_xuat: phieuXuat.length, phieu_nhap: 0, ban_hang: banHang.length,
    nhat_ky: nhatKy.length, hang_doi_tin: 0,
  };
}

// ---------- log lấy mẫu ----------
const anomCap = { syn: 6, backlog: 5, seg: 8, reset: 10, timeout: 10, lock: 6, conn: 8, err: 10 };
const anomShown = {};
const anomHidden = {};
function anom(kind, line) {
  anomShown[kind] = anomShown[kind] || 0;
  if (VERBOSE || anomShown[kind] < anomCap[kind]) {
    anomShown[kind]++;
    out(line);
  } else {
    anomHidden[kind] = (anomHidden[kind] || 0) + 1;
  }
}
function printHidden(kinds) {
  const names = {
    syn: 'SYN mất gói', backlog: 'SYN bị bỏ do backlog đầy', seg: 'segment truyền lại',
    reset: 'kết nối bị reset', timeout: 'connect timeout', lock: 'lần chờ khóa dòng kho_tong',
    conn: 'lỗi connect phải thử lại', err: 'lỗi đăng nhập/SALE',
  };
  const parts = kinds.filter(k => anomHidden[k]).map(k => `${nf(anomHidden[k])} ${names[k]}`);
  if (parts.length) out(C.gray(`${INDENT}… đã ẩn bớt ${parts.join(', ')} (thêm --verbose để xem hết)`));
}
const trace = (c, line) => { if (VERBOSE || c.traced) out(line); };
const tag = {
  net: C.blue('[NET]'), tcp: C.gray('[TCP]'), cn: C.magenta('[CN ]'), sv: C.cyan('[SV ]'),
  sse: C.yellow('[SSE]'), admin: C.yellow('[ADMIN]'), warn: C.bold(C.yellow('[WARN]')),
};

// ---------- mạng ----------
const SV = '10.0.0.10:5000';
const BACKLOG = 128;
const ACCEPT_COST = 0.35; // ms mỗi lần accept của luồng selector NIO
const net = {
  synSent: 0, synLost: 0, backlogDrop: 0, timeouts: 0, resets: 0, handshaking: 0, online: 0,
  acceptQ: 0, peakAcceptQ: 0, segSent: 0, segLost: 0, bytesIn: 0, bytesOut: 0, winIn: 0, winOut: 0,
  rtt: [], loginLat: [], saleLat: [], reqArrived: 0,
};
let acceptorFree = 0;
const inbox = []; // LOW_STOCK đã tới server, theo thứ tự đến

// Gửi một dòng giao thức qua TCP, có thể mất segment và phải truyền lại
function send(c, dir, line, then) {
  const cmd = line.split('|')[0];
  const r = sampleRtt(c);
  let d = r / 2 + 0.05;
  const bytes = Buffer.byteLength(line) + 1 + 40; // + '\n' + header TCP/IP
  net.segSent++;
  c.p.seg++;
  msgCount++;
  if (dir === 'IN') { net.bytesIn += bytes; net.winIn += bytes; } else { net.bytesOut += bytes; net.winOut += bytes; }
  if (rand() < c.p.loss) {
    const rto = Math.max(300, 2 * r); // RTO tối thiểu của TCP trên Windows ~300 ms
    net.segLost++;
    c.p.lost++;
    d += rto;
    anom('seg', `${T()} ${C.yellow('[NET]')} ${dir === 'IN' ? c.ma + ' → SV' : 'SV → ' + c.ma} mất segment ${cmd} ` +
      `(${c.p.ten}), TCP truyền lại sau ${fmtMs(rto)}`);
  }
  const rec = { ma_cn: c.ma, chieu: dir, lenh: cmd, noi_dung: line };
  if (dir === 'OUT') {
    rec.t = vt;
    nkBuf.push(rec);
    trace(c, `${T()} ${tag.tcp} ${C.cyan('SV')} → ${c.ma.padEnd(7)} ${line}`);
  }
  at(vt + d, () => {
    if (dir === 'IN') {
      rec.t = vt;
      nkBuf.push(rec);
      trace(c, `${T()} ${tag.tcp} ${c.ma.padEnd(7)} → ${C.cyan('SV')} ${line}`);
    }
    then();
  });
}

function sendSyn(c) {
  const sentAt = vt;
  c.synTries++;
  net.synSent++;
  const rto = 1000 * 2 ** (c.synTries - 1);
  const r = sampleRtt(c);
  if (c.synTries === 1) trace(c, `${T()} ${tag.net} ${c.ma} ${c.ip}:${c.port} → ${SV} SYN (${c.p.ten})`);
  if (rand() < c.p.loss) {
    net.synLost++;
    c.p.synRetry++;
    anom('syn', `${T()} ${C.yellow('[NET]')} ${c.ma} (${c.p.ten}) mất gói SYN → gửi lại sau RTO ${rto} ms (lần ${c.synTries})`);
    return retrySyn(c, sentAt + rto);
  }
  at(vt + r / 2, () => {
    if (net.acceptQ >= BACKLOG) {
      net.backlogDrop++;
      c.p.synRetry++;
      anom('backlog', `${T()} ${C.yellow('[NET]')} hàng đợi accept đầy (${BACKLOG}/${BACKLOG}) → bỏ SYN của ${c.ma}, ` +
        `client gửi lại sau ${rto} ms`);
      return retrySyn(c, sentAt + rto);
    }
    net.acceptQ++;
    net.peakAcceptQ = Math.max(net.peakAcceptQ, net.acceptQ);
    acceptorFree = Math.max(vt, acceptorFree) + ACCEPT_COST;
    at(acceptorFree, () => {
      net.acceptQ--;
      at(vt + r / 2, () => established(c, r, vt - sentAt));
    });
  });
}
function retrySyn(c, when) {
  if (c.synTries < 3) return at(when, () => sendSyn(c));
  // 3 SYN không được trả lời → connect timeout, kết nối lại theo backoff có jitter
  at(when, () => {
    const back = uniform(100, 500);
    net.timeouts++;
    c.synTries = 0;
    anom('timeout', `${T()} ${C.red('[NET]')} ${c.ma} connect timed out sau 3 SYN → kết nối lại sau ${fmtMs(back)} (jitter)`);
    at(vt + back, () => sendSyn(c));
  });
}

function established(c, rtt, hs) {
  net.handshaking--;
  net.online++;
  net.rtt.push(rtt);
  c.p.rtts.push(rtt);
  c.p.hs.push(hs);
  trace(c, `${T()} ${tag.net} ${c.ma} ${c.ip}:${c.port} ↔ ${SV} ${C.green('ESTABLISHED')} ` +
    `bắt tay ${fmtMs(hs)} (RTT ${fmtMs(rtt)}, ${c.synTries} SYN)`);
  c.synTries = 0;
  c.loginSentAt = vt;
  send(c, 'IN', `LOGIN|${c.ma}|******`, () => {
    at(vt + uniform(0.6, 2.2), () => send(c, 'OUT', `LOGIN_OK|${c.ten}`, () => loginOk(c)));
  });
}

function loginOk(c) {
  net.loginLat.push(vt - c.loginSentAt);
  if (!c.wasReset && rand() < c.p.reset) {
    const back = uniform(100, 500);
    c.wasReset = true;
    net.resets++;
    c.p.resets++;
    net.online--;
    net.handshaking++;
    anom('reset', `${T()} ${C.red('[NET]')} ${c.ma} ECONNRESET (mạng ${c.p.ten} chập chờn) → server đóng phiên, ` +
      `client kết nối lại sau ${fmtMs(back)} (backoff có jitter)`);
    at(vt + back, () => sendSyn(c));
    return;
  }
  c.saleSentAt = vt;
  send(c, 'IN', `SALE|${c.sp}|${c.ban}`, () => {
    at(vt + uniform(0.8, 3), () => {
      c.kho[c.sp] -= c.ban;
      banHang.push({ ma_cn: c.ma, ma_sp: c.sp, so_luong: c.ban, t: vt });
      send(c, 'OUT', `SALE_OK|${c.sp}|${c.kho[c.sp]}`, () => saleOk(c));
    });
  });
}

function saleOk(c) {
  net.saleLat.push(vt - c.saleSentAt);
  trace(c, `${T()} ${tag.cn} ${c.ma}: tồn ${c.sp} còn ${c.kho[c.sp]} < ngưỡng ${c.nguong} → tự gửi LOW_STOCK`);
  send(c, 'IN', `LOW_STOCK|${c.sp}|${c.kho[c.sp]}|${c.nguong}`, () => {
    net.reqArrived++;
    inbox.push(c);
  });
}

// ---------- server xử lý ----------
const POOL = 20;
const freeIds = Array.from({ length: POOL }, (_, k) => POOL - k); // pop() lấy id nhỏ trước
// Ưu tiên bước sau để YC đang dở không bị kẹt sau hàng nghìn YC mới
const waiting = { A: [], B: [], C: [] };
const spLock = Object.fromEntries(SP.map(s => [s.ma, 0]));
const spHolder = {};
const oosWarned = {};
let oosTraced = 0;
const sv = {
  done: 0, HOAN_TAT: 0, TU_CHOI: 0, lockWaits: 0, lockWaitMs: [], waitA: [], work: [], pushRtt: [],
  winDone: 0, start: 0,
};
const poolName = id => C.cyan(`[db-pool-${p2(id)}]`);
const load = () => 1 + (0.6 * (POOL - freeIds.length)) / POOL;
function acquire(stage, fn) {
  if (freeIds.length) fn(freeIds.pop());
  else waiting[stage].push(fn);
}
function release(id) {
  const next = waiting.C.shift() || waiting.B.shift() || waiting.A.shift();
  if (next) next(id);
  else freeIds.push(id);
}

// A: ghi yêu cầu mới (CHO), báo admin qua SSE
function stageA(job) {
  const c = job.c;
  const qAt = vt;
  acquire('A', id => {
    const wait = vt - qAt;
    const dur = uniform(3, 9) * load();
    sv.waitA.push(wait);
    job.startAt = vt;
    at(vt + dur, () => {
      const yc = {
        ma_yc: yeuCau.length + 1, ma_cn: c.ma, ma_sp: c.sp, de_xuat: 3 * c.nguong - c.kho[c.sp],
        giao: null, tt: 'CHO', tao: vt, cap_nhat: vt,
      };
      yeuCau.push(yc);
      job.yc = yc;
      trace(c, `${T()} ${poolName(id)} YC#${yc.ma_yc} ← LOW_STOCK của ${c.ma}: INSERT yeu_cau ` +
        `(${c.ma}, ${c.sp}, de_xuat=${yc.de_xuat}, 'CHO') ${fmtMs(dur)}, chờ pool ${fmtMs(wait)}`);
      release(id);
      at(vt + uniform(2, 12), () => {
        trace(c, `${T()} ${tag.sse} admin ← cảnh báo thiếu hàng YC#${yc.ma_yc}: ${c.ma} ${c.sp} ` +
          `tồn ${c.kho[c.sp]} < ngưỡng ${c.nguong}`);
        at(vt + uniform(3, 15), () => stageB(job));
      });
    });
  });
}

// B: admin bấm "Gửi hàng"; giao dịch giữ khóa dòng kho_tong, kho không đủ thì "Báo hết hàng"
function stageB(job) {
  const c = job.c;
  const yc = job.yc;
  const sp = c.sp;
  acquire('B', id => {
    const lockAt = Math.max(vt, spLock[sp]);
    const lockWait = lockAt - vt;
    const holder = spHolder[sp];
    const dur = uniform(3, 8) * load();
    spLock[sp] = lockAt + dur;
    spHolder[sp] = yc.ma_yc;
    if (lockWait > 0) {
      sv.lockWaits++;
      sv.lockWaitMs.push(lockWait);
      if (!c.traced) {
        anom('lock', `${T()} ${poolName(id)} YC#${yc.ma_yc} chờ khóa dòng kho_tong ${sp} ${fmtMs(lockWait)} ` +
          `(YC#${holder} đang giữ)`);
      }
    }
    at(lockAt + dur, () => {
      const con = khoTong[sp];
      const need = yc.de_xuat;
      const sp0 = spByMa[sp];
      if (con >= need) {
        trace(c, `${T()} ${tag.admin} bấm "Gửi hàng" YC#${yc.ma_yc} (${need} ${sp0.dv} ${sp0.ten})`);
        khoTong[sp] -= need;
        yc.giao = need;
        yc.tt = 'DA_GIAO';
        yc.cap_nhat = vt;
        const px = { ma_px: phieuXuat.length + 1, ma_yc: yc.ma_yc, ma_cn: c.ma, ma_sp: sp, so_luong: need, t: vt };
        phieuXuat.push(px);
        trace(c, `${T()} ${poolName(id)} YC#${yc.ma_yc} BEGIN; UPDATE kho_tong ${sp} ${con} → ${khoTong[sp]}; ` +
          `INSERT phieu_xuat #${px.ma_px}; yeu_cau → DA_GIAO; COMMIT ${fmtMs(dur)}` +
          (lockWait > 0 ? `, chờ khóa ${fmtMs(lockWait)}` : ''));
        release(id);
        const pushAt = vt;
        send(c, 'OUT', `DELIVERED|${yc.ma_yc}|${sp}|${need}`, () => {
          c.replies++;
          at(vt + uniform(0.5, 3), () => send(c, 'IN', `RECEIVED|${yc.ma_yc}`, () => {
            sv.pushRtt.push(vt - pushAt);
            stageC(job, 'HOAN_TAT');
          }));
        });
      } else {
        if (!oosWarned[sp]) {
          oosWarned[sp] = true;
          out(`${T()} ${tag.warn} kho_tong ${sp} (${sp0.ten}) không đủ: còn ${con}, YC#${yc.ma_yc} cần ${need} ` +
            `→ admin bắt đầu "Báo hết hàng" cho ${sp}`);
          if (oosTraced < 2) {
            oosTraced++;
            c.traced = true;
          }
        }
        trace(c, `${T()} ${tag.admin} bấm "Báo hết hàng" YC#${yc.ma_yc} (kho tổng còn ${con} < ${need})`);
        yc.tt = 'THIEU_HANG';
        yc.cap_nhat = vt;
        trace(c, `${T()} ${poolName(id)} YC#${yc.ma_yc} UPDATE yeu_cau → THIEU_HANG; COMMIT ${fmtMs(dur)}`);
        release(id);
        const pushAt = vt;
        send(c, 'OUT', `OUT_OF_STOCK|${yc.ma_yc}|${con}|${sp}`, () => {
          c.replies++;
          at(vt + uniform(0.5, 3), () => send(c, 'IN', `REJECT|${yc.ma_yc}`, () => {
            sv.pushRtt.push(vt - pushAt);
            stageC(job, 'TU_CHOI');
          }));
        });
      }
    });
  });
}

// C: chi nhánh xác nhận → đóng yêu cầu
function stageC(job, tt) {
  const c = job.c;
  const yc = job.yc;
  acquire('C', id => {
    const dur = uniform(2, 5) * load();
    at(vt + dur, () => {
      yc.tt = tt;
      yc.cap_nhat = vt;
      if (tt === 'HOAN_TAT') {
        const before = c.kho[c.sp];
        c.kho[c.sp] += yc.giao;
        trace(c, `${T()} ${poolName(id)} YC#${yc.ma_yc} yeu_cau → ${C.green('HOAN_TAT')}; kho_chi_nhanh ` +
          `${c.ma}/${c.sp} ${before} → ${c.kho[c.sp]} ${fmtMs(dur)}`);
      } else {
        trace(c, `${T()} ${poolName(id)} YC#${yc.ma_yc} yeu_cau → ${C.yellow('TU_CHOI')} ${fmtMs(dur)}`);
      }
      release(id);
      sv.done++;
      sv.winDone++;
      sv[tt]++;
      sv.work.push(vt - job.startAt);
      const every = Math.max(1, Math.round(N / 10));
      if (!c.traced && sv.done % every === 0) {
        out(`${T()} ${tag.sv} YC#${yc.ma_yc} ${c.ma} ${c.sp} → ${tt === 'HOAN_TAT' ? C.green(tt) : C.yellow(tt)}` +
          (yc.giao ? ` (giao ${yc.giao} ${spByMa[c.sp].dv})` : '') + `, xử lý ${fmtMs(vt - job.startAt)}`);
      }
    });
  });
}

// ---------- các pha ----------
function header(n, title, sub) {
  const line = '═'.repeat(96);
  out();
  out(C.bold(C.blue(line)));
  out(C.bold(` [${n}/4] ${title}`));
  if (sub) out(C.gray(` ${sub}`));
  out(C.bold(C.blue(line)));
}

async function phase1() {
  header(1, 'CSDL BAN ĐẦU', 'PostgreSQL 127.0.0.1:5432 · database phan_phoi_hang · psql -U postgres');
  await sleep(400);
  note('Số dòng từng bảng');
  const c0 = rowCounts();
  table(['bang', 'so_dong'], Object.entries(c0), [1]);
  await sleep(500);
  sql('SELECT sp.ma_sp, sp.ten, sp.don_vi, sp.gia, kt.so_luong FROM san_pham sp JOIN kho_tong kt USING (ma_sp) ORDER BY 1;');
  table(['ma_sp', 'ten', 'don_vi', 'gia', 'so_luong'],
    SP.map(s => [s.ma, s.ten, s.dv, s.gia.toFixed(2), khoTong0[s.ma]]), [3, 4]);
  await sleep(500);
  sql('SELECT ma_cn, ten, dia_chi, gia_lap FROM chi_nhanh ORDER BY ma_cn LIMIT 5;');
  table(['ma_cn', 'ten', 'dia_chi', 'gia_lap'], clients.slice(0, 5).map(c => [c.ma, c.ten, 'Trình giả lập tải', 't']));
  await sleep(500);
  sql('SELECT ma_sp, count(*) AS so_cn, sum(so_luong) AS tong_ton, count(*) FILTER (WHERE so_luong < nguong_toi_thieu) AS duoi_nguong');
  out(C.bold('                 FROM kho_chi_nhanh GROUP BY ma_sp ORDER BY 1;'));
  table(['ma_sp', 'so_cn', 'tong_ton', 'duoi_nguong'], SP.map(s => [
    s.ma, N, clients.reduce((a, c) => a + c.kho0[s.ma], 0), clients.filter(c => c.kho0[s.ma] < c.nguong).length,
  ]), [1, 2, 3]);
  await sleep(500);
  sql(`SELECT * FROM kho_chi_nhanh WHERE ma_cn = '${clients[0].ma}';`);
  table(['ma_cn', 'ma_sp', 'so_luong', 'nguong_toi_thieu'],
    SP.map(s => [clients[0].ma, s.ma, clients[0].kho0[s.ma], clients[0].nguong]), [2, 3]);
  sql('SELECT trang_thai, count(*) FROM yeu_cau GROUP BY trang_thai;');
  table(['trang_thai', 'count'], []);
  note(`Kịch bản: mỗi chi nhánh bán 1 mặt hàng xuống dưới ngưỡng → tự gửi LOW_STOCK. ` +
    `Kho tổng ${SP.filter(s => s.heSo < 1).map(s => s.ma).join(', ')} cố ý thiếu để có nhánh báo hết hàng.`);
  await sleep(1200);
}

async function phase2() {
  header(2, `${nf(N)} CHI NHÁNH KẾT NỐI VÀ GỬI YÊU CẦU · TÌNH TRẠNG MẠNG`,
    `server ${SV} · io.mode=nio · backlog ${BACKLOG} · mạng: ` +
    PROFILES.map(p => `${p.ten} ${nf(p.n)} CN (RTT ${p.rtt[0]}–${p.rtt[1]} ms, mất gói ${(p.loss * 100).toFixed(1)}%)`).join(', '));
  out(C.gray(`${INDENT}mỗi CN: TCP connect → LOGIN → SALE (bán xuống dưới ngưỡng) → LOW_STOCK. ` +
    `Chi tiết in cho ${clients.filter(c => c.traced).map(c => c.ma).join(', ')}; sự cố mạng in mẫu.`));
  out();
  await sleep(800);

  for (const c of clients) {
    // ~45% bấm cùng lúc trong 60 ms đầu, phần còn lại rải trong 2 s
    const t = rand() < 0.45 ? uniform(0, 60) : uniform(0, 2000);
    net.handshaking++;
    at(t, () => sendSyn(c));
  }
  let lastArrived = -1;
  await run(250, 650, tickMs => {
    flushNhatKy(false);
    const s = tickMs / 1000;
    const lossPct = net.segSent + net.synSent ? ((net.segLost + net.synLost) / (net.segSent + net.synSent)) * 100 : 0;
    out(`${T()} ${C.bold(tag.net)} ${bar(net.reqArrived / N)} ${C.bold(`${nf(net.reqArrived)}/${nf(N)}`)} YC đã tới server` +
      ` · online ${nf(net.online)} · đang bắt tay ${nf(net.handshaking)} · accept-queue ${net.acceptQ}/${BACKLOG}`);
    out(`${INDENT}RTT p50 ${fmtMs(pct(net.rtt, 50))} · p95 ${fmtMs(pct(net.rtt, 95))} · max ${fmtMs(pct(net.rtt, 100))}` +
      ` · mất gói ${lossPct.toFixed(2)}% · SYN gửi lại ${net.synLost + net.backlogDrop} · truyền lại ${net.segLost}` +
      ` · reset ${net.resets} · vào ${kb(net.winIn / s)}/s · ra ${kb(net.winOut / s)}/s`);
    if (net.reqArrived === N && lastArrived !== N) out(`${T()} ${tag.net} ${C.green(`đã nhận đủ ${nf(N)} yêu cầu LOW_STOCK`)}`);
    lastArrived = net.reqArrived;
    net.winIn = 0;
    net.winOut = 0;
  });
  flushNhatKy(true);
  printHidden(['syn', 'backlog', 'seg', 'reset', 'timeout']);
  out();
  note('Tổng kết mạng theo loại kết nối');
  table(['mạng', 'số CN', 'RTT TB', 'RTT p95', 'bắt tay p95', 'segment', 'mất gói', 'SYN gửi lại', 'reset'],
    PROFILES.map(p => [p.ten, p.n, fmtMs(avg(p.rtts)), fmtMs(pct(p.rtts, 95)), fmtMs(pct(p.hs, 95)), p.seg,
      p.seg ? ((p.lost / p.seg) * 100).toFixed(2) + '%' : '0%', p.synRetry, p.resets]),
    [1, 2, 3, 4, 5, 6, 7, 8]);
  out(`${INDENT}kết nối thành công ${C.green(`${nf(net.online)}/${nf(N)}`)} · đỉnh accept-queue ${net.peakAcceptQ}/${BACKLOG}` +
    ` · SYN bị bỏ do backlog ${net.backlogDrop} · connect timeout ${net.timeouts}`);
  out(`${INDENT}LOGIN → LOGIN_OK p50 ${fmtMs(pct(net.loginLat, 50))} p95 ${fmtMs(pct(net.loginLat, 95))}` +
    ` · SALE → SALE_OK p50 ${fmtMs(pct(net.saleLat, 50))} p95 ${fmtMs(pct(net.saleLat, 95))}` +
    ` · dữ liệu vào ${kb(net.bytesIn)}, ra ${kb(net.bytesOut)}`);
  await sleep(1500);
}

async function phase3() {
  header(3, `SERVER XỬ LÝ ${nf(N)} YÊU CẦU`,
    `worker dùng pool ${POOL} kết nối PostgreSQL · bot admin nhận cảnh báo qua SSE: kho tổng đủ thì "Gửi hàng", ` +
    `không thì "Báo hết hàng" · nhat_ky ghi theo lô ${nf(NK_BATCH)}`);
  out(C.gray(`${INDENT}mỗi YC: INSERT yeu_cau (CHO) → admin → giao dịch kho_tong (khóa dòng) → DELIVERED/OUT_OF_STOCK ` +
    `→ CN gửi RECEIVED/REJECT → HOAN_TAT/TU_CHOI`));
  out();
  await sleep(800);
  sv.start = vt;
  out(`${T()} ${tag.sv} hàng đợi xử lý: ${nf(inbox.length)} LOW_STOCK, phân cho ${POOL} worker`);
  for (const c of inbox) stageA({ c });
  await run(100, 550, tickMs => {
    flushNhatKy(false);
    const busy = POOL - freeIds.length;
    out(`${T()} ${C.bold(tag.sv)} ${bar(sv.done / N)} ${C.bold(`${nf(sv.done)}/${nf(N)}`)} YC đã đóng` +
      ` · pool DB ${busy}/${POOL} bận · chờ pool: tạo YC ${nf(waiting.A.length)}, gửi hàng ${waiting.B.length},` +
      ` hoàn tất ${waiting.C.length}`);
    out(`${INDENT}yeu_cau ${nf(yeuCau.length)} · đang mở ${nf(yeuCau.length - sv.done)} · ${C.green('HOAN_TAT')} ${nf(sv.HOAN_TAT)}` +
      ` · ${C.yellow('TU_CHOI')} ${nf(sv.TU_CHOI)} · ${nf(sv.winDone / (tickMs / 1000))} YC/s` +
      ` · chờ khóa kho_tong ${nf(sv.lockWaits)} lần · kho tổng ${SP.map(s => `${s.ma}=${khoTong[s.ma]}`).join(' ')}`);
    sv.winDone = 0;
  });
  flushNhatKy(true);
  printHidden(['lock', 'seg']);
  out();
  const total = vt - sv.start;
  note('Tổng kết xử lý');
  table(['chỉ số', 'TB', 'p95', 'max'], [
    ['chờ pool trước khi tạo YC', fmtMs(avg(sv.waitA)), fmtMs(pct(sv.waitA, 95)), fmtMs(pct(sv.waitA, 100))],
    ['xử lý 1 YC (worker nhận → đóng)', fmtMs(avg(sv.work)), fmtMs(pct(sv.work, 95)), fmtMs(pct(sv.work, 100))],
    ['đẩy DELIVERED/OUT_OF_STOCK → CN trả lời', fmtMs(avg(sv.pushRtt)), fmtMs(pct(sv.pushRtt, 95)), fmtMs(pct(sv.pushRtt, 100))],
    ['chờ khóa dòng kho_tong', fmtMs(avg(sv.lockWaitMs)), fmtMs(pct(sv.lockWaitMs, 95)), fmtMs(pct(sv.lockWaitMs, 100))],
  ], [1, 2, 3]);
  out(`${INDENT}xử lý ${nf(N)} YC trong ${(total / 1000).toFixed(2)} s (${nf(N / (total / 1000))} YC/s)` +
    ` · ${C.green('HOAN_TAT')} ${nf(sv.HOAN_TAT)} · ${C.yellow('TU_CHOI')} ${nf(sv.TU_CHOI)}` +
    ` · nhat_ky ${nf(nhatKy.length)} dòng / ${nkBatches} lô`);
  await sleep(1500);
}

async function phase4(counts0) {
  header(4, 'CSDL SAU KHI XỬ LÝ', 'PostgreSQL 127.0.0.1:5432 · database phan_phoi_hang');
  await sleep(400);
  note('Số dòng từng bảng, so với ban đầu');
  const c1 = rowCounts();
  table(['bang', 'truoc', 'sau', 'thay_doi'], Object.keys(c1).map(k => {
    const d = c1[k] - counts0[k];
    return [k, counts0[k], c1[k], d ? C.green('+' + d) : '0'];
  }), [1, 2, 3]);
  await sleep(500);
  const xuat = sp => phieuXuat.filter(p => p.ma_sp === sp).reduce((a, p) => a + p.so_luong, 0);
  note('kho_tong, so với ban đầu');
  table(['ma_sp', 'ten', 'truoc', 'da_xuat', 'sau', 'kiem_tra'], SP.map(s => {
    const ok = khoTong0[s.ma] === xuat(s.ma) + khoTong[s.ma] && khoTong[s.ma] >= 0;
    return [s.ma, s.ten, khoTong0[s.ma], xuat(s.ma), khoTong[s.ma], ok ? C.green('✓ trước = xuất + sau') : C.red('✗ lệch')];
  }), [2, 3, 4]);
  await sleep(500);
  sql('SELECT trang_thai, count(*) AS so_yc, sum(so_luong_giao) AS tong_giao FROM yeu_cau GROUP BY trang_thai ORDER BY 1;');
  const byTt = {};
  for (const y of yeuCau) {
    byTt[y.tt] = byTt[y.tt] || [0, 0];
    byTt[y.tt][0]++;
    byTt[y.tt][1] += y.giao || 0;
  }
  table(['trang_thai', 'so_yc', 'tong_giao'], Object.keys(byTt).sort().map(k => [k, byTt[k][0], byTt[k][1] || null]), [1, 2]);
  await sleep(400);
  sql("SELECT ma_sp, count(*) AS so_yc, count(*) FILTER (WHERE trang_thai = 'HOAN_TAT') AS hoan_tat,");
  out(C.bold("                 count(*) FILTER (WHERE trang_thai = 'TU_CHOI') AS tu_choi FROM yeu_cau GROUP BY 1 ORDER BY 1;"));
  table(['ma_sp', 'so_yc', 'hoan_tat', 'tu_choi'], SP.map(s => {
    const ys = yeuCau.filter(y => y.ma_sp === s.ma);
    return [s.ma, ys.length, ys.filter(y => y.tt === 'HOAN_TAT').length, ys.filter(y => y.tt === 'TU_CHOI').length];
  }), [1, 2, 3]);
  await sleep(400);
  const ycRow = y => [y.ma_yc, y.ma_cn, y.ma_sp, y.de_xuat, y.giao, y.tt, stamp(y.tao), stamp(y.cap_nhat)];
  const ycHead = ['ma_yc', 'ma_cn', 'ma_sp', 'so_luong_de_xuat', 'so_luong_giao', 'trang_thai', 'tao_luc', 'cap_nhat_luc'];
  sql('SELECT ma_yc, ma_cn, ma_sp, so_luong_de_xuat, so_luong_giao, trang_thai, tao_luc, cap_nhat_luc FROM yeu_cau ORDER BY ma_yc LIMIT 5;');
  table(ycHead, yeuCau.slice(0, 5).map(ycRow), [0, 3, 4]);
  const tuChoi = yeuCau.filter(y => y.tt === 'TU_CHOI');
  if (tuChoi.length) {
    sql("SELECT ... FROM yeu_cau WHERE trang_thai = 'TU_CHOI' ORDER BY ma_yc LIMIT 3;");
    table(ycHead, tuChoi.slice(0, 3).map(ycRow), [0, 3, 4]);
  }
  await sleep(400);
  sql('SELECT ma_px, ma_yc, ma_cn, ma_sp, so_luong, thoi_gian FROM phieu_xuat ORDER BY ma_px DESC LIMIT 3;');
  table(['ma_px', 'ma_yc', 'ma_cn', 'ma_sp', 'so_luong', 'thoi_gian'],
    phieuXuat.slice(-3).reverse().map(p => [p.ma_px, p.ma_yc, p.ma_cn, p.ma_sp, p.so_luong, stamp(p.t)]), [0, 1, 4]);
  await sleep(400);
  note('kho_chi_nhanh, so với ban đầu');
  table(['ma_sp', 'tong_ton_truoc', 'tong_ton_sau', 'duoi_nguong_truoc', 'duoi_nguong_sau'], SP.map(s => [
    s.ma,
    clients.reduce((a, c) => a + c.kho0[s.ma], 0),
    clients.reduce((a, c) => a + c.kho[s.ma], 0),
    clients.filter(c => c.kho0[s.ma] < c.nguong).length,
    clients.filter(c => c.kho[s.ma] < c.nguong).length,
  ]), [1, 2, 3, 4]);
  await sleep(400);
  sql('SELECT chieu, lenh, count(*) FROM nhat_ky GROUP BY chieu, lenh ORDER BY chieu, count(*) DESC;');
  const byLenh = {};
  for (const r of nhatKy) {
    const k = r.chieu + '|' + r.lenh;
    byLenh[k] = (byLenh[k] || 0) + 1;
  }
  table(['chieu', 'lenh', 'count'], Object.entries(byLenh)
    .map(([k, v]) => [...k.split('|'), v])
    .sort((a, b) => a[0].localeCompare(b[0]) || b[2] - a[2]), [2]);
  sql('SELECT id, ma_cn, chieu, lenh, noi_dung, thoi_gian FROM nhat_ky ORDER BY id DESC LIMIT 6;');
  table(['id', 'ma_cn', 'chieu', 'lenh', 'noi_dung', 'thoi_gian'],
    nhatKy.slice(-6).reverse().map(r => [r.id, r.ma_cn, r.chieu, r.lenh, r.noi_dung, stamp(r.t)]), [0]);
  await sleep(500);

  note('Kiểm tra sau xử lý');
  const open = yeuCau.filter(y => !['HOAN_TAT', 'TU_CHOI'].includes(y.tt)).length;
  const lost = clients.filter(c => c.replies === 0).length;
  const dup = clients.filter(c => c.replies > 1).length;
  const checks = [
    [SP.every(s => khoTong0[s.ma] === xuat(s.ma) + khoTong[s.ma] && khoTong[s.ma] >= 0),
      `kho_tong: trước = đã xuất + còn lại cho cả ${SP.length} mặt hàng (không xuất vượt, không âm)`],
    [yeuCau.length === N, `yeu_cau có đúng ${nf(N)} dòng, mỗi LOW_STOCK một yêu cầu`],
    [open === 0, `không còn YC treo (CHO / DA_DE_XUAT / DA_GIAO / THIEU_HANG): ${open}`],
    [lost === 0 && dup === 0, `mỗi CN nhận đúng 1 tin DELIVERED hoặc OUT_OF_STOCK: mất ${lost}, trùng ${dup}`],
    [phieuXuat.length === sv.HOAN_TAT, `phieu_xuat ${nf(phieuXuat.length)} = số YC HOAN_TAT ${nf(sv.HOAN_TAT)}`],
    [banHang.length === N, `ban_hang ${nf(banHang.length)} dòng = số SALE_OK`],
    [nhatKy.length === msgCount, `nhat_ky ${nf(nhatKy.length)} dòng = ${nf(msgCount)} tin đã gửi/nhận, không bỏ bản ghi`],
  ];
  for (const [ok, text] of checks) out(`  ${ok ? C.green('[✓]') : C.red('[✗]')} ${text}`);
  return checks.every(c => c[0]);
}

// =====================================================================================
// CHẾ ĐỘ CHẠY THẬT (--real): cùng 4 phần như trên nhưng dùng server.jar và PostgreSQL thật.
// - CN ảo SIM001..SIMn (db/seed_loadsim.sql) mở socket TCP thật, gửi LOGIN → SALE → LOW_STOCK.
// - Bot admin đăng nhập trang công ty, nghe SSE /api/events, bấm "Gửi hàng" (kho không đủ thì
//   "Báo hết hàng") qua HTTP như thực nghiệm E6; CN trả RECEIVED/REJECT.
// - CSDL in bằng psql thật. Chuẩn bị/dọn dữ liệu bằng /api/experiment/prepare-live và finish-live,
//   cộng xoá nhat_ky/ban_hang do lượt chạy sinh ra; chỉ đụng tới CN ảo và kho tổng của 1 mặt hàng.
// =====================================================================================
const path = require('path');
const os = require('os');
const tcp = require('net');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const START_SERVER = !!args['start-server'];
const HOST = args.host || '127.0.0.1';
// tự bật server thì mặc định dùng cổng riêng, tránh server đang chạy ở 5000/8080
const PORT = parseInt(args.port, 10) || (START_SERVER ? 5100 : 5000);
const ADMIN_PORT = parseInt(args['admin-port'], 10) || (START_SERVER ? 8180 : 8080);
const ADMIN_USER = args['admin-user'] || 'admin';
const ADMIN_PASSWORD = args['admin-password'] || 'admin123';
const BRANCH_PASSWORD = args['branch-password'] || '123456';
const PRODUCT = typeof args.product === 'string' ? args.product : 'SP05';
const SHIP = parseInt(args.ship, 10) || 10;
const KEEP = !!args.keep;
const TON_CN = 12;
const NGUONG = 10;
const ADMIN_THREADS = 8;
const wait = ms => new Promise(r => setTimeout(r, ms));

function readProps(file) {
  const p = {};
  try {
    for (const line of fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/)) {
      const m = /^\s*([^#=\s][^=]*?)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) p[m[1]] = m[2];
    }
  } catch {
    // không có file .local thì dùng cấu hình chung
  }
  return p;
}
function dbConfig() {
  const p = { ...readProps('config/server.properties'), ...readProps('config/server.local.properties') };
  const m = /^jdbc:postgresql:\/\/([^:/]+)(?::(\d+))?\/([^?]+)/.exec(p['db.url'] || '');
  return {
    host: m ? m[1] : '127.0.0.1', port: (m && m[2]) || '5432', name: m ? m[3] : 'phan_phoi_hang',
    user: p['db.user'] || 'postgres', password: process.env.PGPASSWORD || p['db.password'] || '',
  };
}
function findPsql() {
  if (typeof args.psql === 'string') return args.psql;
  const win = 'C:\\Program Files\\PostgreSQL';
  try {
    const v = fs.readdirSync(win).filter(d => fs.existsSync(path.join(win, d, 'bin', 'psql.exe')))
      .sort((a, b) => Number(b) - Number(a))[0];
    if (v) return path.join(win, v, 'bin', 'psql.exe');
  } catch {
    // không phải Windows hoặc chưa cài vào chỗ mặc định
  }
  return 'psql';
}

// ---------- psql ----------
const DB = dbConfig();
const PSQL = findPsql();
function psql(q, tuplesOnly) {
  const a = ['-h', DB.host, '-p', DB.port, '-U', DB.user, '-d', DB.name, '-X', '-v', 'ON_ERROR_STOP=1', '-P', 'pager=off'];
  if (tuplesOnly) a.push('-t', '-A');
  a.push('-c', q);
  const r = spawnSync(PSQL, a, {
    encoding: 'utf8', env: { ...process.env, PGPASSWORD: DB.password, PGCLIENTENCODING: 'UTF8' },
  });
  if (r.error || r.status !== 0) throw new Error('psql: ' + (r.error ? r.error.message : r.stderr.trim()));
  return r.stdout;
}
const psqlShow = q => {
  sql(q);
  out(psql(q).trimEnd());
  out();
};
const psqlVal = q => psql(q, true).trim();
const SIM_ALL = 'SELECT ma_cn FROM chi_nhanh WHERE gia_lap';
// nhat_ky ghi LOGIN với ma_cn NULL vì tin tới trước khi đăng nhập
const NK_SIM = `(ma_cn IN (${SIM_ALL}) OR (ma_cn IS NULL AND noi_dung LIKE 'LOGIN|SIM%'))`;
const COUNT_TABLES = ['chi_nhanh', 'kho_tong', 'kho_chi_nhanh', 'yeu_cau', 'phieu_xuat', 'ban_hang', 'nhat_ky', 'hang_doi_tin'];
function countTables() {
  const q = COUNT_TABLES.map(t => `SELECT '${t}', count(*) FROM ${t}`).join(' UNION ALL ');
  return Object.fromEntries(psqlVal(q).split(/\r?\n/).map(l => l.split('|')).map(([k, v]) => [k, Number(v)]));
}

// ---------- HTTP + SSE tới trang công ty ----------
const ADMIN_BASE = `http://${HOST}:${ADMIN_PORT}`;
let cookie = '';
async function api(method, p, body) {
  const r = await fetch(ADMIN_BASE + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  if (!r.ok) {
    const e = new Error(`HTTP ${r.status} ${p}: ${text}`);
    e.status = r.status;
    throw e;
  }
  return text ? JSON.parse(text) : {};
}
async function openSse(onEvent) {
  const ctrl = new AbortController();
  const r = await fetch(ADMIN_BASE + '/api/events', { headers: { Cookie: cookie }, signal: ctrl.signal });
  if (!r.ok) throw new Error(`SSE HTTP ${r.status}`);
  (async () => {
    const dec = new TextDecoder();
    let buf = '';
    let ev = null;
    try {
      for await (const chunk of r.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).replace(/\r$/, '');
          buf = buf.slice(i + 1);
          if (line.startsWith('event: ')) ev = line.slice(7);
          else if (line.startsWith('data: ') && ev) {
            const d = line.slice(6);
            if (d.startsWith('{')) onEvent(ev, JSON.parse(d));
            ev = null;
          }
        }
      }
    } catch (e) {
      if (!ctrl.signal.aborted) out(`${T()} ${tag.warn} mất luồng SSE: ${e.message}`);
    }
  })();
  return () => ctrl.abort();
}

// ---------- giao thức dòng văn bản (common/Protocol.java) ----------
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\|/g, '\\p').replace(/\n/g, '\\n').replace(/\r/g, '');
function decodeLine(line) {
  const parts = [];
  let cur = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && i + 1 < line.length) {
      const n = line[++i];
      cur += n === 'p' ? '|' : n === 'n' ? '\n' : n;
    } else if (ch === '|') {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  return { cmd: parts[0], params: parts.slice(1), raw: line };
}

// Một chi nhánh ảo nối TCP thật tới server
class RealClient {
  constructor(ma, i, n) {
    this.ma = ma;
    this.traced = i <= 2 || (n >= 40 && i % Math.floor(n / 4) === 0);
    this.waiters = [];
    this.msgs = 0;
    this.logins = 0;
    this.replies = 0;
    this.tries = 0;
    this.closing = false;
  }
  connect(onPush, onClose) {
    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      const s = tcp.connect({ host: HOST, port: PORT });
      let buf = '';
      let up = false;
      s.setNoDelay(true);
      s.setEncoding('utf8');
      s.once('connect', () => {
        up = true;
        this.sock = s;
        resolve(performance.now() - t0);
      });
      s.on('error', e => { if (!up) reject(e); });
      s.on('close', () => { if (up && !this.closing) onClose(this); });
      s.on('data', d => {
        buf += d;
        let k;
        while ((k = buf.indexOf('\n')) >= 0) {
          const m = decodeLine(buf.slice(0, k).replace(/\r$/, ''));
          buf = buf.slice(k + 1);
          this.msgs++;
          trace(this, `${T()} ${tag.tcp} ${C.cyan('SV')} → ${this.ma.padEnd(7)} ${m.raw}`);
          if (m.cmd === 'PING') this.send('PONG');
          else if (m.cmd === 'DELIVERED' || m.cmd === 'OUT_OF_STOCK') onPush(this, m);
          const w = this.waiters.find(x => x.cmds.includes(m.cmd));
          if (w) {
            this.waiters.splice(this.waiters.indexOf(w), 1);
            clearTimeout(w.timer);
            w.resolve(m);
          }
        }
      });
    });
  }
  send(cmd, ...ps) {
    const line = [cmd, ...ps.map(esc)].join('|');
    if (cmd === 'LOGIN') this.logins++;
    this.msgs++;
    this.sock.write(line + '\n');
    trace(this, `${T()} ${tag.tcp} ${this.ma.padEnd(7)} → ${C.cyan('SV')} ${cmd === 'LOGIN' ? `LOGIN|${this.ma}|******` : line}`);
  }
  await(cmds, ms) {
    return new Promise(resolve => {
      const w = { cmds, resolve };
      w.timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        resolve(null);
      }, ms);
      this.waiters.push(w);
    });
  }
  close() {
    this.closing = true;
    if (this.sock) this.sock.destroy();
  }
}

function startServer() {
  const jar = path.join(ROOT, 'server', 'target', 'server.jar');
  if (!fs.existsSync(jar)) throw new Error('chưa có server/target/server.jar, chạy scripts\\build.bat trước');
  let java = 'java';
  try {
    const jdk = fs.readdirSync(path.join(ROOT, 'tools')).find(d => d.startsWith('jdk-17'));
    if (jdk) java = path.join(ROOT, 'tools', jdk, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  } catch {
    // không có tools\ thì dùng java trên PATH
  }
  const logFile = path.join(os.tmpdir(), `sim-log-server-${PORT}.log`);
  const argv = ['-jar', jar, 'open.browser=false', 'log.quiet=true', 'discovery.enabled=false',
    `max.clients=${N + 100}`, `tcp.port=${PORT}`, `admin.http.port=${ADMIN_PORT}`];
  const p = spawn(java, argv, { cwd: ROOT });
  const log = fs.createWriteStream(logFile);
  return new Promise((resolve, reject) => {
    let tail = '';
    const timer = setTimeout(() => reject(new Error(`server không sẵn sàng sau 60 s, xem ${logFile}`)), 60000);
    const onData = d => {
      log.write(d);
      tail = (tail + d).slice(-300);
      if (tail.includes('san sang')) {
        clearTimeout(timer);
        resolve({ p, logFile, argv });
      }
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', onData);
    p.on('error', e => { clearTimeout(timer); reject(e); });
    p.on('exit', code => { clearTimeout(timer); reject(new Error(`server.jar thoát (mã ${code}), xem ${logFile}`)); });
  });
}
const portOpen = port => new Promise(resolve => {
  const s = tcp.connect({ host: HOST, port }, () => { s.destroy(); resolve(true); });
  s.on('error', () => resolve(false));
});

async function runReal() {
  const realStart = Date.now();
  out(C.bold('Chạy thật: hệ thống phân phối hàng hóa với cảnh báo thiếu hàng tự động'));
  out(C.gray(`server ${HOST}:${PORT} · trang công ty ${ADMIN_BASE} · CSDL ${DB.user}@${DB.host}:${DB.port}/${DB.name}` +
    ` · psql ${PSQL} · mặt hàng ${PRODUCT}, mỗi lần gửi ${SHIP}`));

  let server = null;
  let prepared = null;
  let stopSse = () => {};
  let cs = [];
  let cleaned = false;
  const markers = {};
  async function cleanup() {
    if (cleaned) return;
    cleaned = true;
    stopSse();
    for (const c of cs) c.close();
    if (prepared && !KEEP) {
      try {
        await api('POST', '/api/experiment/finish-live', { maSp: PRODUCT, khoTong: prepared.khoTongTruoc });
        const nk = psqlVal(`WITH d AS (DELETE FROM nhat_ky WHERE id > ${markers.nk} AND ${NK_SIM} RETURNING 1) SELECT count(*) FROM d`);
        const bh = psqlVal(`WITH d AS (DELETE FROM ban_hang WHERE id > ${markers.bh} AND ma_cn IN (${SIM_ALL}) RETURNING 1) SELECT count(*) FROM d`);
        out(C.gray(`Đã dọn: xoá YC/phiếu xuất của CN ảo, trả kho tổng ${PRODUCT} về ${prepared.khoTongTruoc}, ` +
          `trả kho CN ảo về 1.000.000/ngưỡng 0, xoá ${nf(+nk)} dòng nhat_ky và ${nf(+bh)} dòng ban_hang của lượt chạy.`));
      } catch (e) {
        out(C.red(`Dọn dữ liệu lỗi: ${e.message}`));
      }
    } else if (prepared) {
      out(C.yellow(`--keep: giữ nguyên dữ liệu lượt chạy. Dọn sau bằng POST ${ADMIN_BASE}/api/experiment/finish-live ` +
        `{"maSp":"${PRODUCT}","khoTong":${prepared.khoTongTruoc}}`));
    }
    if (server) {
      server.p.kill();
      out(C.gray(`Đã tắt server.jar tự bật (log: ${server.logFile}).`));
    }
  }
  process.once('SIGINT', async () => {
    out(C.yellow('\nNgắt giữa chừng, đang dọn dữ liệu…'));
    await cleanup();
    process.exit(130);
  });

  try {
    // ---------- kết nối server, CSDL ----------
    if (START_SERVER) {
      if (await portOpen(PORT) || await portOpen(ADMIN_PORT)) {
        throw new Error(`cổng ${PORT} hoặc ${ADMIN_PORT} đang có tiến trình khác, chọn --port=/--admin-port= khác`);
      }
      out(`${T()} ${tag.sv} khởi động server.jar (max.clients=${N + 100}, tcp ${PORT}, http ${ADMIN_PORT})…`);
      server = await startServer();
      out(`${T()} ${tag.sv} server sẵn sàng · log ${server.logFile}`);
    }
    try {
      await api('GET', '/api/experiment/runtime');
    } catch (e) {
      throw new Error(`không gọi được ${ADMIN_BASE}/api/experiment/runtime (${e.message}). ` +
        'Bật server trước (scripts\\run-server.bat max.clients=2000) hoặc thêm --start-server');
    }
    psqlVal('SELECT 1');
    const sims = psqlVal(`${SIM_ALL} ORDER BY ma_cn LIMIT ${N}`).split(/\r?\n/).filter(Boolean);
    if (!sims.length) throw new Error('CSDL chưa có CN ảo, chạy psql -f db/seed_loadsim.sql trước');
    if (sims.length < N) out(C.yellow(`CSDL chỉ có ${sims.length} CN ảo, chạy với ${sims.length} CN`));
    const n = sims.length;
    cs = sims.map((ma, k) => new RealClient(ma, k + 1, n));
    const byMa = new Map(cs.map(c => [c.ma, c]));
    await api('POST', '/api/auth/login', { user: ADMIN_USER, matKhau: ADMIN_PASSWORD });

    // kho tổng chỉ đủ ~80% số lần gửi để luôn có nhánh "Báo hết hàng" (như E6)
    const stock = Math.floor((n * SHIP * 4) / 5);
    markers.nk = +psqlVal('SELECT coalesce(max(id), 0) FROM nhat_ky');
    markers.bh = +psqlVal('SELECT coalesce(max(id), 0) FROM ban_hang');
    prepared = await api('POST', '/api/experiment/prepare-live',
      { maSp: PRODUCT, soChiNhanh: n, tonCn: TON_CN, nguong: NGUONG, khoTong: stock });
    const SIM_RUN = `SELECT ma_cn FROM chi_nhanh WHERE gia_lap ORDER BY ma_cn LIMIT ${n}`;

    // ---------- [1/4] CSDL ban đầu ----------
    header(1, 'CSDL BAN ĐẦU (PostgreSQL thật)', `${DB.host}:${DB.port}/${DB.name} · đã gọi /api/experiment/prepare-live: ` +
      `${n} CN ảo tồn ${PRODUCT} = ${TON_CN}, ngưỡng ${NGUONG}; kho tổng ${PRODUCT} = ${stock} (trước đó ${prepared.khoTongTruoc})`);
    note('Số dòng từng bảng (count(*) qua psql)');
    const counts0 = countTables();
    table(['bang', 'so_dong'], COUNT_TABLES.map(k => [k, counts0[k]]), [1]);
    psqlShow(`SELECT sp.ma_sp, sp.ten, sp.don_vi, kt.so_luong FROM san_pham sp JOIN kho_tong kt USING (ma_sp) WHERE ma_sp = '${PRODUCT}';`);
    psqlShow(`SELECT ma_cn, ten, gia_lap FROM chi_nhanh WHERE gia_lap ORDER BY ma_cn LIMIT 5;`);
    psqlShow(`SELECT ma_sp, count(*) AS so_cn, sum(so_luong) AS tong_ton, count(*) FILTER (WHERE so_luong < nguong_toi_thieu) AS duoi_nguong FROM kho_chi_nhanh WHERE ma_sp = '${PRODUCT}' AND ma_cn IN (${SIM_RUN}) GROUP BY ma_sp;`);
    psqlShow(`SELECT trang_thai, count(*) FROM yeu_cau WHERE ma_cn IN (${SIM_ALL}) GROUP BY trang_thai;`);
    await sleep(1000);

    // ---------- SSE: cảnh báo và trạng thái YC ----------
    const rs = {
      online: 0, connecting: 0, connErr: 0, failed: 0, loginFail: 0, serverFull: 0, disconnects: 0, lowSent: 0,
      alerts: 0, connect: [], login: [], sale: [], alertLat: [], shipHttp: [], pushLat: [], cycle: [],
      shipped: 0, shortage: 0, adminErr: 0, delivered: 0, oos: 0, HOAN_TAT: 0, TU_CHOI: 0, salesOk: 0, inflight: 0,
    };
    const queue = [];
    const ycOf = new Map(); // maYc → client
    const shipAt = new Map();
    const finals = new Set();
    let ready;
    const readyP = new Promise(r => { ready = r; });
    stopSse = await openSse((ev, d) => {
      if (ev === 'branches') return ready();
      if (!d.maCn || !byMa.has(d.maCn) || d.maSp !== PRODUCT) return;
      const c = byMa.get(d.maCn);
      if (ev === 'alert') {
        rs.alerts++;
        if (c.lowAt) rs.alertLat.push(performance.now() - c.lowAt);
        ycOf.set(d.maYc, c);
        c.yc = d.maYc;
        queue.push(d);
        trace(c, `${T()} ${tag.sse} admin ← cảnh báo YC#${d.maYc}: ${d.maCn} ${d.maSp} tồn ${d.soLuongCon} < ngưỡng ${d.nguong}` +
          ` (server đã INSERT yeu_cau 'CHO'), kho tổng còn ${d.tonTong}`);
      } else if (ev === 'request') {
        if ((d.trangThai === 'HOAN_TAT' || d.trangThai === 'TU_CHOI') && !finals.has(d.maYc)) {
          finals.add(d.maYc);
          rs[d.trangThai]++;
          if (c.lowAt) rs.cycle.push(performance.now() - c.lowAt);
          trace(c, `${T()} ${tag.sse} admin ← YC#${d.maYc} → ${d.trangThai === 'HOAN_TAT' ? C.green(d.trangThai) : C.yellow(d.trangThai)}`);
          const every = Math.max(1, Math.round(n / 10));
          if (!c.traced && finals.size % every === 0) {
            out(`${T()} ${tag.sv} YC#${d.maYc} ${d.maCn} ${d.maSp} → ${d.trangThai === 'HOAN_TAT' ? C.green(d.trangThai) : C.yellow(d.trangThai)}` +
              (d.soLuongGiao ? ` (giao ${d.soLuongGiao})` : ''));
          }
        } else if (!finals.has(d.maYc)) {
          trace(c, `${T()} ${tag.sse} admin ← YC#${d.maYc} → ${d.trangThai}`);
        }
      }
    });
    await Promise.race([readyP, wait(5000)]);

    const onPush = (c, m) => {
      const yc = Number(m.params[0]);
      c.replies++;
      const t = shipAt.get(yc);
      if (t) rs.pushLat.push(performance.now() - t);
      if (m.cmd === 'DELIVERED') {
        rs.delivered++;
        c.send('RECEIVED', yc);
      } else {
        rs.oos++;
        c.send('REJECT', yc);
      }
    };
    const onClose = c => {
      rs.disconnects++;
      rs.online--;
      anom('reset', `${T()} ${C.red('[NET]')} ${c.ma} server đóng kết nối`);
    };

    // ---------- [2/4] kết nối và gửi yêu cầu ----------
    header(2, `${nf(n)} CHI NHÁNH KẾT NỐI VÀ GỬI YÊU CẦU · TÌNH TRẠNG MẠNG (TCP thật)`,
      `server ${HOST}:${PORT} · mỗi CN: connect → LOGIN → SALE|${PRODUCT}|${TON_CN - NGUONG + 1} → LOW_STOCK · ` +
      `chi tiết in cho ${cs.filter(c => c.traced).map(c => c.ma).join(', ')}`);
    out();
    const flow = async c => {
      rs.connecting++;
      for (;;) {
        try {
          rs.connect.push(await c.connect(onPush, onClose));
          break;
        } catch (e) {
          c.tries++;
          rs.connErr++;
          if (c.tries >= 6) {
            rs.connecting--;
            rs.failed++;
            anom('timeout', `${T()} ${C.red('[NET]')} ${c.ma} bỏ cuộc sau ${c.tries} lần connect: ${e.code || e.message}`);
            return;
          }
          const back = Math.random() * Math.min(2000, 100 * 2 ** c.tries);
          anom('conn', `${T()} ${C.yellow('[NET]')} ${c.ma} connect lỗi ${e.code || e.message} → thử lại sau ` +
            `${fmtMs(back)} (backoff có jitter, lần ${c.tries})`);
          await wait(back);
        }
      }
      rs.connecting--;
      rs.online++;
      trace(c, `${T()} ${tag.net} ${c.ma} ${c.sock.localAddress}:${c.sock.localPort} ↔ ${HOST}:${PORT} ` +
        `${C.green('ESTABLISHED')} bắt tay ${fmtMs(rs.connect[rs.connect.length - 1])}`);
      let t = performance.now();
      c.send('LOGIN', c.ma, BRANCH_PASSWORD);
      const lg = await c.await(['LOGIN_OK', 'LOGIN_FAIL', 'ERROR'], 15000);
      if (!lg || lg.cmd !== 'LOGIN_OK') {
        rs.loginFail++;
        if (lg && lg.cmd === 'ERROR' && lg.params[0] === 'E03') rs.serverFull++;
        anom('err', `${T()} ${C.red('[SV ]')} ${c.ma} không đăng nhập được: ${lg ? lg.raw : 'hết 15 s chờ LOGIN_OK'}`);
        return;
      }
      rs.login.push(performance.now() - t);
      t = performance.now();
      c.send('SALE', PRODUCT, TON_CN - NGUONG + 1);
      const s = await c.await(['SALE_OK', 'ERROR'], 15000);
      if (!s || s.cmd !== 'SALE_OK') {
        anom('err', `${T()} ${C.red('[SV ]')} ${c.ma} SALE lỗi: ${s ? s.raw : 'hết 15 s chờ SALE_OK'}`);
        return;
      }
      rs.sale.push(performance.now() - t);
      rs.salesOk++;
      const con = Number(s.params[1]);
      trace(c, `${T()} ${tag.cn} ${c.ma}: tồn ${PRODUCT} còn ${con} < ngưỡng ${NGUONG} → tự gửi LOW_STOCK`);
      c.lowAt = performance.now();
      c.send('LOW_STOCK', PRODUCT, con, NGUONG);
      rs.lowSent++;
    };
    // ~45% bấm cùng lúc, phần còn lại rải trong 2 s như bản giả lập
    const flows = cs.map(c => wait(Math.random() < 0.45 ? Math.random() * 60 : Math.random() * 2000).then(() => flow(c)));
    let flowsDone = false;
    Promise.all(flows).then(() => { flowsDone = true; });

    let rt = {};
    let polling = false;
    const pollRuntime = () => {
      if (polling) return;
      polling = true;
      api('GET', '/api/experiment/runtime').then(r => { rt = r; }, () => {}).finally(() => { polling = false; });
    };
    const rtText = () => (rt.threads ? ` · server: ${rt.connections} kết nối, ${rt.threads} luồng, heap ${Math.round(rt.heapUsedMb)} MB` : '');
    let lastIn = 0;
    let lastOut = 0;
    const netStatus = () => {
      let bin = 0;
      let bout = 0;
      for (const c of cs) {
        if (c.sock) {
          bin += c.sock.bytesRead;
          bout += c.sock.bytesWritten;
        }
      }
      const r = [bin - lastIn, bout - lastOut];
      lastIn = bin;
      lastOut = bout;
      return r;
    };
    const t2 = performance.now();
    for (;;) {
      await wait(250);
      pollRuntime();
      const [bin, bout] = netStatus();
      out(`${T()} ${C.bold(tag.net)} ${bar(rs.alerts / n)} ${C.bold(`${nf(rs.alerts)}/${nf(n)}`)} YC đã tạo trên server` +
        ` · online ${nf(rs.online)} · đang kết nối ${rs.connecting} · LOW_STOCK đã gửi ${nf(rs.lowSent)}` +
        ` · lỗi connect ${rs.connErr} · đăng nhập lỗi ${rs.loginFail}`);
      out(`${INDENT}connect p50 ${fmtMs(pct(rs.connect, 50))} p95 ${fmtMs(pct(rs.connect, 95))}` +
        ` · LOGIN p95 ${fmtMs(pct(rs.login, 95))} · SALE p95 ${fmtMs(pct(rs.sale, 95))}` +
        ` · vào ${kb(bin / 0.25)}/s · ra ${kb(bout / 0.25)}/s${rtText()}`);
      if (flowsDone && (rs.alerts >= rs.lowSent || performance.now() - t2 > 30000)) break;
    }
    printHidden(['conn', 'timeout', 'reset', 'err']);
    out();
    note('Tổng kết mạng');
    table(['chỉ số', 'TB', 'p50', 'p95', 'max'], [
      ['TCP connect (bắt tay)', rs.connect], ['LOGIN → LOGIN_OK', rs.login], ['SALE → SALE_OK', rs.sale],
      ['LOW_STOCK → admin nhận cảnh báo SSE', rs.alertLat],
    ].map(([k, a]) => [k, fmtMs(avg(a)), fmtMs(pct(a, 50)), fmtMs(pct(a, 95)), fmtMs(pct(a, 100))]), [1, 2, 3, 4]);
    out(`${INDENT}kết nối thành công ${C.green(`${nf(rs.online)}/${nf(n)}`)} · lỗi connect ${rs.connErr} (đã thử lại)` +
      ` · bỏ cuộc ${rs.failed} · đăng nhập lỗi ${rs.loginFail} · LOW_STOCK ${nf(rs.lowSent)} · YC tạo ${nf(rs.alerts)}`);
    if (rs.serverFull) {
      out(C.yellow(`${INDENT}${rs.serverFull} CN bị từ chối vì server đã đủ max.clients. Bật lại server với ` +
        `max.clients=2000 (scripts\\run-server.bat max.clients=2000) hoặc dùng --start-server.`));
    }
    await sleep(1200);

    // ---------- [3/4] server xử lý ----------
    header(3, `SERVER XỬ LÝ ${nf(rs.alerts)} YÊU CẦU`, `bot admin ${ADMIN_THREADS} luồng HTTP: POST /api/requests/{id}/ship ` +
      `{soLuong:${SHIP}}, kho không đủ (HTTP 400) thì POST /shortage · CN trả RECEIVED/REJECT · trạng thái cuối qua SSE`);
    out();
    const total = rs.alerts;
    let warned = false;
    const adminWorker = async () => {
      while (queue.length) {
        const a = queue.shift();
        const c = ycOf.get(a.maYc);
        const t0 = performance.now();
        shipAt.set(a.maYc, t0);
        rs.inflight++;
        try {
          await api('POST', `/api/requests/${a.maYc}/ship`, { soLuong: SHIP });
          rs.shipped++;
          rs.shipHttp.push(performance.now() - t0);
          trace(c, `${T()} ${tag.admin} bấm "Gửi hàng" YC#${a.maYc} (${SHIP}) → HTTP 200 ${fmtMs(performance.now() - t0)}` +
            ' (server: trừ kho_tong, INSERT phieu_xuat, YC → DA_GIAO, đẩy DELIVERED)');
        } catch (e) {
          if (e.status !== 400) {
            rs.adminErr++;
            out(`${T()} ${C.red('[ADMIN]')} YC#${a.maYc} lỗi: ${e.message}`);
          } else {
            if (!warned) {
              warned = true;
              out(`${T()} ${tag.warn} kho_tong ${PRODUCT} không đủ gửi ${SHIP} cho YC#${a.maYc} (HTTP 400) → admin bắt đầu "Báo hết hàng"`);
              c.traced = true;
            }
            try {
              await api('POST', `/api/requests/${a.maYc}/shortage`, { soLuong: SHIP });
              rs.shortage++;
              trace(c, `${T()} ${tag.admin} bấm "Báo hết hàng" YC#${a.maYc} → HTTP 200 (YC → THIEU_HANG, đẩy OUT_OF_STOCK)`);
            } catch (e2) {
              rs.adminErr++;
              out(`${T()} ${C.red('[ADMIN]')} YC#${a.maYc} báo hết hàng lỗi: ${e2.message}`);
            }
          }
        } finally {
          rs.inflight--;
        }
      }
    };
    const t3 = performance.now();
    let doneLast = 0;
    const workers = Promise.all(Array.from({ length: ADMIN_THREADS }, adminWorker));
    for (;;) {
      await wait(200);
      pollRuntime();
      const done = finals.size;
      out(`${T()} ${C.bold(tag.sv)} ${bar(total ? done / total : 1)} ${C.bold(`${nf(done)}/${nf(total)}`)} YC đã đóng` +
        ` · chờ admin ${nf(queue.length)} · HTTP đang chạy ${rs.inflight} · Gửi hàng ${nf(rs.shipped)} · Báo hết ${nf(rs.shortage)}` +
        ` · ${nf((done - doneLast) / 0.2)} YC/s`);
      out(`${INDENT}CN nhận DELIVERED ${nf(rs.delivered)} · OUT_OF_STOCK ${nf(rs.oos)} · ${C.green('HOAN_TAT')} ${nf(rs.HOAN_TAT)}` +
        ` · ${C.yellow('TU_CHOI')} ${nf(rs.TU_CHOI)} · HTTP ship p95 ${fmtMs(pct(rs.shipHttp, 95))}` +
        ` · admin bấm → CN nhận p95 ${fmtMs(pct(rs.pushLat, 95))}${rtText()}`);
      doneLast = done;
      if (done >= total || performance.now() - t3 > 60000) break;
    }
    await workers;
    printHidden(['reset']);
    out();
    note('Tổng kết xử lý');
    table(['chỉ số', 'TB', 'p95', 'max'], [
      ['HTTP "Gửi hàng"', rs.shipHttp], ['admin bấm → CN nhận DELIVERED/OUT_OF_STOCK', rs.pushLat],
      ['LOW_STOCK → đóng YC (gồm lúc chờ hết phần 2)', rs.cycle],
    ].map(([k, a]) => [k, fmtMs(avg(a)), fmtMs(pct(a, 95)), fmtMs(pct(a, 100))]), [1, 2, 3]);
    out(`${INDENT}xử lý ${nf(total)} YC trong ${((performance.now() - t3) / 1000).toFixed(2)} s · ` +
      `${C.green('HOAN_TAT')} ${nf(rs.HOAN_TAT)} · ${C.yellow('TU_CHOI')} ${nf(rs.TU_CHOI)} · lỗi admin ${rs.adminErr}`);

    // ---------- [4/4] CSDL sau xử lý ----------
    // nhat_ky ghi theo lô bất đồng bộ: chờ tới khi đủ số tin hoặc không tăng nữa
    const expectedNk = cs.reduce((a, c) => a + c.msgs, 0);
    let nkRun = 0;
    for (let k = 0, last = -1, still = 0; k < 40 && still < 4; k++) {
      nkRun = +psqlVal(`SELECT count(*) FROM nhat_ky WHERE id > ${markers.nk} AND ${NK_SIM}`);
      if (nkRun >= expectedNk) break;
      still = nkRun === last ? still + 1 : 0;
      last = nkRun;
      await wait(300);
    }
    header(4, 'CSDL SAU KHI XỬ LÝ (PostgreSQL thật)', `${DB.host}:${DB.port}/${DB.name}`);
    note('Số dòng từng bảng, so với ban đầu');
    const counts1 = countTables();
    table(['bang', 'truoc', 'sau', 'thay_doi'], COUNT_TABLES.map(k => {
      const d = counts1[k] - counts0[k];
      return [k, counts0[k], counts1[k], d > 0 ? C.green('+' + d) : String(d)];
    }), [1, 2, 3]);
    psqlShow(`SELECT kt.ma_sp, ${stock} AS truoc, (SELECT coalesce(sum(so_luong), 0) FROM phieu_xuat WHERE ma_sp = kt.ma_sp AND ma_cn IN (${SIM_ALL})) AS da_xuat, kt.so_luong AS sau FROM kho_tong kt WHERE ma_sp = '${PRODUCT}';`);
    psqlShow(`SELECT trang_thai, count(*) AS so_yc, sum(so_luong_giao) AS tong_giao FROM yeu_cau WHERE ma_cn IN (${SIM_ALL}) GROUP BY trang_thai ORDER BY 1;`);
    psqlShow(`SELECT ma_yc, ma_cn, ma_sp, so_luong_de_xuat, so_luong_giao, trang_thai, tao_luc, cap_nhat_luc FROM yeu_cau WHERE ma_cn IN (${SIM_ALL}) ORDER BY ma_yc LIMIT 5;`);
    if (rs.TU_CHOI) psqlShow(`SELECT ma_yc, ma_cn, ma_sp, so_luong_de_xuat, trang_thai, cap_nhat_luc FROM yeu_cau WHERE ma_cn IN (${SIM_ALL}) AND trang_thai = 'TU_CHOI' ORDER BY ma_yc LIMIT 3;`);
    psqlShow(`SELECT ma_px, ma_yc, ma_cn, ma_sp, so_luong, thoi_gian FROM phieu_xuat WHERE ma_cn IN (${SIM_ALL}) ORDER BY ma_px DESC LIMIT 3;`);
    psqlShow(`SELECT ma_sp, count(*) AS so_cn, sum(so_luong) AS tong_ton, count(*) FILTER (WHERE so_luong < nguong_toi_thieu) AS duoi_nguong FROM kho_chi_nhanh WHERE ma_sp = '${PRODUCT}' AND ma_cn IN (${SIM_RUN}) GROUP BY ma_sp;`);
    psqlShow(`SELECT chieu, lenh, count(*) FROM nhat_ky WHERE id > ${markers.nk} AND ${NK_SIM} GROUP BY chieu, lenh ORDER BY chieu, count(*) DESC;`);
    psqlShow(`SELECT id, ma_cn, chieu, lenh, noi_dung, thoi_gian FROM nhat_ky WHERE id > ${markers.nk} AND ${NK_SIM} ORDER BY id DESC LIMIT 6;`);

    note('Kiểm tra sau xử lý');
    const [kho, xuat] = psqlVal(`SELECT so_luong, (SELECT coalesce(sum(so_luong), 0) FROM phieu_xuat WHERE ma_sp = '${PRODUCT}' AND ma_cn IN (${SIM_ALL})) FROM kho_tong WHERE ma_sp = '${PRODUCT}'`).split('|').map(Number);
    const [ycAll, ycOpen, ycDone] = psqlVal(`SELECT count(*), count(*) FILTER (WHERE trang_thai NOT IN ('HOAN_TAT', 'TU_CHOI')), count(*) FILTER (WHERE trang_thai = 'HOAN_TAT') FROM yeu_cau WHERE ma_cn IN (${SIM_ALL})`).split('|').map(Number);
    const pxCount = +psqlVal(`SELECT count(*) FROM phieu_xuat WHERE ma_cn IN (${SIM_ALL})`);
    const bhCount = +psqlVal(`SELECT count(*) FROM ban_hang WHERE id > ${markers.bh} AND ma_cn IN (${SIM_ALL})`);
    const lost = cs.filter(c => c.lowAt && c.replies === 0).length;
    const dup = cs.filter(c => c.replies > 1).length;
    const checks = [
      [stock === xuat + kho && kho >= 0, `kho_tong ${PRODUCT}: trước ${stock} = đã xuất ${xuat} + còn ${kho} (không xuất vượt, không âm)`],
      [ycAll === rs.lowSent, `yeu_cau của CN ảo ${nf(ycAll)} dòng = ${nf(rs.lowSent)} LOW_STOCK đã gửi`],
      [ycOpen === 0, `không còn YC treo (CHO / DA_DE_XUAT / DA_GIAO / THIEU_HANG): ${ycOpen}`],
      [lost === 0 && dup === 0, `mỗi CN nhận đúng 1 tin DELIVERED hoặc OUT_OF_STOCK: mất ${lost}, trùng ${dup}`],
      [pxCount === ycDone, `phieu_xuat ${nf(pxCount)} = số YC HOAN_TAT ${nf(ycDone)}`],
      [bhCount === rs.salesOk, `ban_hang thêm ${nf(bhCount)} dòng = ${nf(rs.salesOk)} SALE_OK`],
      [nkRun === expectedNk, `nhat_ky thêm ${nf(nkRun)} dòng = ${nf(expectedNk)} tin CN ảo đã gửi/nhận, không bỏ bản ghi`],
    ];
    for (const [ok, text] of checks) out(`  ${ok ? C.green('[✓]') : C.red('[✗]')} ${text}`);
    const allOk = checks.every(c => c[0]);
    out();
    out(C.bold(allOk ? C.green('Hoàn tất: dữ liệu nhất quán.') : C.red('Hoàn tất: có kiểm tra không đạt.')) +
      C.gray(` Chạy thật ${((Date.now() - realStart) / 1000).toFixed(1)} s.`));
    process.exitCode = allOk ? 0 : 1;
  } catch (e) {
    out(C.red(`Lỗi: ${e.message}`));
    process.exitCode = 1;
  } finally {
    await cleanup();
    if (fileLines) {
      fs.writeFileSync(LOG_FILE, fileLines.join('\n') + '\n', 'utf8');
      out(C.gray(`Đã ghi log ra ${LOG_FILE}`));
    }
  }
}

(async () => {
  if (args.real) return runReal();
  const realStart = Date.now();
  out(C.bold('Giả lập log: hệ thống phân phối hàng hóa với cảnh báo thiếu hàng tự động'));
  out(C.gray(`${nf(N)} chi nhánh ảo · seed ${SEED} · tốc độ x${SPEED || '∞'} · ` +
    'dữ liệu giả lập, không kết nối server/PostgreSQL thật'));
  const counts0 = rowCounts();
  await phase1();
  await phase2();
  await phase3();
  const ok = await phase4(counts0);
  out();
  out(C.bold(ok ? C.green('Hoàn tất: dữ liệu nhất quán.') : C.red('Hoàn tất: có kiểm tra không đạt.')) +
    C.gray(` Thời gian ảo ${(vt / 1000).toFixed(2)} s, chạy thật ${((Date.now() - realStart) / 1000).toFixed(1)} s.`));
  if (fileLines) {
    fs.writeFileSync(LOG_FILE, fileLines.join('\n') + '\n', 'utf8');
    out(C.gray(`Đã ghi log ra ${LOG_FILE}`));
  }
  process.exitCode = ok ? 0 : 1;
})();
