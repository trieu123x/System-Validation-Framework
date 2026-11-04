const { chromium } = require('../tools/browser-check/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

(async () => {
  const root = path.resolve('ui/out');
  const products = JSON.parse(await fs.readFile('landing/src/data/products.json', 'utf8')).slice(0, process.env.UI_FILTER_CHECK === '1' ? 31 : 6);
  const inventory = products.map((p, i) => ({ maHang: p.id, tenHang: p.name, soLuong: [4,2,7,10,6,8][i % 6], nguong: [2,3,2,4,0,2][i % 6], model: p.model, danhMuc: p.category, giaBanLe: p.retailPrice, giaXuat: p.retailPrice, anh: p.image.url }));
  const state = { canRejectDelivered: true, status: 'ONLINE', statusDetail: 'Đã kết nối', server: 'localhost', maCn: 'CN01', tenCn: 'Chi nhánh Lĩnh Nam', inventory, requests: [], transfers: [], broadcasts: [], notices: [], inbox: [], history: [], historyRange: '', daBao: [], debt: null };
  const adminProducts = products.map(p => ({ maSp: p.id, ten: p.name, donVi: 'cái', model: p.model, maDm: p.categoryId, tenDm: p.category, giaNhap: Math.round(p.retailPrice * .7), giaXuat: Math.round(p.retailPrice * .85), giaBanLe: p.retailPrice, tonTong: 100, anhUrl: p.image.url }));
  const branches = [{ maCn: 'CN01', ten: state.tenCn, diaChi: 'Hà Nội', giaLap: false, ycMo: 0, tinCho: 0, online: true }];
  const warehouse = { maCn: 'CN01', ten: state.tenCn, diaChi: 'Hà Nội', online: true, thieu: 2, sapThieu: 0, du: 3, chuaDat: 1, giaTriTon: 20000000, ycMo: 0, conNo: 1000000, hanMuc: 2000000, vuotHanMuc: false };
  const branchDebt = { maCn: 'CN01', tenCn: state.tenCn, giaLap: false, tongNhan: 2000000, daTra: 1000000, conNo: 1000000, hanMuc: 2000000, trangThai: 'CON_NO' };
  const supplierDebt = { maNcc: 'NCC01', ten: 'Nhà cung cấp thử nghiệm', tongNhap: 5000000, daTra: 1000000, conNo: 4000000 };
  const peers = new Set();
  const changes = [];
  const orders = new Map();
  const createdBodies = [];
  let confirms = 0;
  const receivingDecisions = [];
  const send = (res, data, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
  const broadcast = () => { for (const res of peers) res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`); };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = url.pathname;
    try {
      if (pathname === '/api/events') { res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }); peers.add(res); broadcast(); req.on('close', () => peers.delete(res)); return; }
      if (pathname === '/api/state') return send(res, state);
      if (pathname === '/api/browser/heartbeat') return send(res, { ok: true });
      if (/^\/api\/inbox\/\d+\/reply$/.test(pathname)) { state.inbox.forEach(item => { item.trangThai = 'DA_XEM'; }); send(res, {ok: true}); broadcast(); return; }
      if (pathname === '/api/inventory/refresh') { send(res, {ok: true}); broadcast(); return; }
      const decision = pathname.match(/^\/api\/requests\/(\d+)\/(reject|received)$/);
      if (decision) {
        let body = ''; for await (const chunk of req) body += chunk;
        receivingDecisions.push({id: Number(decision[1]), action: decision[2], body: JSON.parse(body)});
        const request = state.requests.find(row => row.maYc === Number(decision[1]));
        request.trangThai = decision[2] === 'reject' ? 'TU_CHOI' : 'HOAN_TAT';
        if (decision[2] === 'received') request.soLuongNhan = JSON.parse(body).soLuongNhan;
        send(res, {ok: true}); broadcast(); return;
      }
      if (pathname === '/api/auth/me') return send(res, { loggedIn: true, user: 'admin' });
      if (pathname === '/api/branches') return send(res, branches);
      if (pathname === '/api/products') return send(res, adminProducts);
      if (pathname === '/api/stats') return send(res, { tinPhutQua: 20, ketNoi: 1, runtime: { ioMode: 'NIO', threads: 16, heapUsedMb: 40 } });
      if (pathname === '/api/security/overview') return send(res, {ketNoi: 1, tinGiay: 0, ipBiChan: 0, mode: 'DETECT', suKienBiBo: 0, suKien24h: {high: 0, medium: 0, low: 0}});
      if (pathname === '/api/categories') return send(res, [...new Map(adminProducts.map(p => [p.maDm, {maDm: p.maDm, ten: p.tenDm, soMatHang: adminProducts.filter(i => i.maDm === p.maDm).length}])).values()]);
      if (pathname === '/api/suppliers') return send(res, [supplierDebt]);
      if (pathname === '/api/warehouses') return send(res, [warehouse]);
      if (pathname === '/api/stock/branches') return send(res, inventory.map(i => ({maCn: 'CN01', tenCn: state.tenCn, maSp: i.maHang, tenSp: i.tenHang, soLuong: i.soLuong, nguongToiThieu: i.nguong})));
      if (pathname === '/api/warehouses/CN01') return send(res, { ...warehouse, matHang: inventory.map((i, index) => ({ ...adminProducts[index], soLuong: i.soLuong, nguong: i.nguong, muc: i.nguong === 0 ? 'unset' : i.soLuong < i.nguong ? 'critical' : 'ok', giaTri: i.soLuong * i.giaBanLe, ycMo: null, ban7Ngay: 3, deXuat: 2 })) });
      if (pathname === '/api/debts/summary') return send(res, {tongNhap: 5000000, tongXuat: 2000000, daThuCn: 1000000, daTraNcc: 1000000, conNoCn: 1000000, conNoNcc: 4000000});
      if (pathname === '/api/debts/branches') return send(res, [branchDebt]);
      if (pathname === '/api/debts/branches/CN01') return send(res, {tongHop: branchDebt, butToan: []});
      if (pathname === '/api/debts/suppliers') return send(res, [supplierDebt]);
      if (pathname === '/api/debts/suppliers/NCC01') return send(res, {tongHop: supplierDebt, butToan: []});
      if (pathname === '/api/reconcile') return send(res, {khop: true, sanPham: [], ghiChu: ''});
      if (['/api/alerts','/api/requests','/api/imports','/api/transfers','/api/notices','/api/notices/suggest','/api/security/events','/api/security/ips','/api/security/sessions','/api/security/scraping/blocks'].includes(pathname)) return send(res, []);
      if (pathname === '/api/threshold') {
        let body = ''; for await (const chunk of req) body += chunk;
        const change = JSON.parse(body); changes.push(change);
        inventory.find(i => i.maHang === change.maHang).nguong = change.nguong;
        send(res, { ok: true }); broadcast(); return;
      }
      if (pathname === '/api/checkout') {
        let body = ''; for await (const chunk of req) body += chunk;
        const request = JSON.parse(body);
        createdBodies.push(request);
        const items = request.items.map(line => { const item = inventory.find(i => i.maHang === line.maHang); return { ...line, tenHang: item.tenHang, model: item.model, donVi: 'cái', giaBanLe: item.giaBanLe, thanhTien: item.giaBanLe * line.soLuong }; });
        const order = { id: request.id, customer: request.customer, maCn: 'CN01', tenCn: state.tenCn, status: 'PENDING', createdAt: new Date().toISOString(), total: items.reduce((n, i) => n + i.thanhTien, 0), quantity: items.reduce((n,i) => n + i.soLuong, 0), items };
        orders.set(order.id, order); return send(res, order);
      }
      const confirmed = pathname.match(/^\/api\/checkout\/(.+)\/confirm$/);
      if (confirmed) { confirms++; const order = orders.get(confirmed[1]); order.status = 'PAID'; order.paidAt = new Date().toISOString(); return send(res, order); }
      if (pathname === '/api/invoices') return send(res, [...orders.values()].filter(o => o.status === 'PAID'));
      if (pathname.startsWith('/api/invoices/')) return send(res, orders.get(pathname.split('/').pop()));
      let file = path.resolve(root, '.' + decodeURIComponent(pathname));
      if (!file.startsWith(root + path.sep)) return send(res, {}, 403);
      if ((await fs.stat(file)).isDirectory()) file = path.join(file, 'index.html');
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime }); res.end(await fs.readFile(file));
    } catch (e) { send(res, { error: e.message }, 404); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  await fs.mkdir('tools/navigation-preview', { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.EDGE_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); console.error('BROWSER:', e.message); });
    if (process.env.UI_CAPTURE_BEFORE === '1' || process.env.UI_CAPTURE_AFTER === '1') {
      const phase = process.env.UI_CAPTURE_BEFORE === '1' ? 'before' : 'after';
      await fs.mkdir(`tools/ui-redesign/${phase}`, {recursive: true});
      for (const width of [1440, 1024, 768, 390]) {
        await page.setViewportSize({width, height: 1000});
        for (const route of ['branch', 'admin']) {
          await page.goto(`${baseUrl}/${route}/`);
          await page.locator('.subbar h1').waitFor();
          await page.screenshot({path: `tools/ui-redesign/${phase}/${route}-${width}.png`, fullPage: true});
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} ${width}px overflow`);
          if (phase === 'after') assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(245, 247, 250)');
        }
      }
      console.log(`${phase}: captured admin and branch at 1440, 1024, 768 and 390px; no horizontal overflow.`);
      return;
    }
    const desktop = () => page.viewportSize().width >= 1200;
    const openMenu = async () => {
      if (desktop()) {
        const expand = page.getByRole('button', {name: 'Mở rộng menu', exact: true});
        if (await expand.count()) await expand.click();
        await page.locator('.app-sidebar').waitFor();
      } else { await page.getByRole('button', {name: 'Mở menu', exact: true}).click(); await page.getByRole('dialog').waitFor(); }
    };
    const navigate = async label => {
      if (typeof label === 'string' ? label === 'Thông báo' : label.test('Thông báo')) { await page.locator('.header-notification').click(); return; }
      await openMenu();
      await (desktop() ? page.locator('.app-sidebar') : page.getByRole('dialog')).getByRole('button', {name: label}).click();
      if (!desktop()) await page.getByRole('dialog').waitFor({state: 'hidden'});
    };
    await fs.mkdir('tools/ui-redesign/after', {recursive: true});
    if (process.env.UI_LOGIN_CHECK === '1') {
      let branchAllowed = false, adminAllowed = false, branchAttempts = 0, adminAttempts = 0;
      await page.route('**/api/config', route => route.fulfill({json: {server: 'localhost', branchId: ''}}));
      await page.route('**/api/state', route => route.fulfill({json: branchAllowed ? state : {status: 'DISCONNECTED', statusDetail: '', server: 'localhost'}}));
      await page.route('**/api/auth/me', route => route.fulfill({json: {loggedIn: adminAllowed, user: adminAllowed ? 'admin' : null}}));
      await page.route('**/api/login', route => {
        branchAttempts++;
        if (route.request().postDataJSON().matKhau === 'correct-test-password') { branchAllowed = true; return route.fulfill({json: state}); }
        return route.fulfill({status: 401, json: {error: 'Sai tên đăng nhập hoặc mật khẩu.'}});
      });
      await page.route('**/api/auth/login', route => {
        adminAttempts++;
        if (route.request().postDataJSON().matKhau === 'correct-test-password') { adminAllowed = true; return route.fulfill({json: {user: 'admin'}}); }
        return route.fulfill({status: 401, json: {error: 'Sai tên đăng nhập hoặc mật khẩu.'}});
      });
      let documents = 0;
      page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++; });
      for (const role of ['branch', 'admin']) {
        await page.goto(`${baseUrl}/${role}/`);
        const password = page.getByLabel('Mật khẩu', {exact: true});
        await password.waitFor();
        const identity = page.locator('.login input:not([type="password"])');
        await identity.fill(role === 'branch' ? 'CN01' : 'admin');
        const before = documents;
        for (const value of ['wrong-test-password', 'another-wrong-password']) {
          await password.fill(value);
          await page.getByRole('button', {name: 'Đăng nhập', exact: true}).click();
          await page.getByRole('alert').filter({hasText: 'Sai tên đăng nhập hoặc mật khẩu.'}).waitFor();
          assert.equal(await password.inputValue(), value);
          assert.equal(await identity.inputValue(), role === 'branch' ? 'CN01' : 'admin');
          assert.equal(documents, before, `${role}: failed login reloaded the document`);
          assert.equal(await page.locator('.workspace-shell').count(), 0);
        }
        assert.equal(role === 'branch' ? branchAttempts : adminAttempts, 2);
        if (role === 'branch') {
          await page.route('**/api/login', route => route.fulfill({status: 429, headers: {'Retry-After': '60'}, json: {error: 'Đăng nhập chi nhánh này trên IP hiện tại bị khóa. Thử lại sau 60 giây.'}}), {times: 1});
          await page.getByRole('button', {name: 'Đăng nhập', exact: true}).click();
          await page.getByRole('alert').filter({hasText: 'chi nhánh này trên IP hiện tại bị khóa'}).waitFor();
          assert.equal(documents, before, 'IP block must not reload the login form');
          assert.equal(await password.inputValue(), 'another-wrong-password');
        }
        await password.fill('correct-test-password');
        await page.getByRole('button', {name: 'Đăng nhập', exact: true}).click();
        await page.getByRole('heading', {name: role === 'branch' ? 'Bán hàng & tồn kho' : 'Tổng quan', exact: true}).waitFor();
        if (role === 'branch') {
          for (const width of [1440, 390]) {
            await page.setViewportSize({width, height: 900});
            await openMenu();
            const sales = (desktop() ? page.locator('.app-sidebar') : page.getByRole('dialog')).getByRole('button', {name: 'Bán hàng', exact: true});
            assert.equal(await sales.getAttribute('aria-current'), 'page');
            assert.equal(await sales.evaluate(element => element.classList.contains('active')), false);
            assert.equal(await sales.locator('.nav-count').count(), 0);
            if (!desktop()) await page.getByRole('button', {name: 'Đóng menu', exact: true}).click();
          }
          await page.setViewportSize({width: 1440, height: 1000});
          branchAllowed = false;
          await page.route('**/api/threshold', route => route.fulfill({status: 401, json: {error: 'Phiên đăng nhập đã hết hạn.'}}));
          await navigate('Đặt ngưỡng');
          const row = page.locator('tbody tr').filter({has: page.getByLabel('Ngưỡng TB01', {exact: true})});
          await row.getByRole('spinbutton').fill('9');
          await row.getByRole('button', {name: 'Lưu', exact: true}).click();
          await page.getByLabel('Mật khẩu', {exact: true}).waitFor();
          assert.ok(documents > before, 'Protected 401 still resets an expired branch session');
        }
      }
      assert.deepEqual(errors, []);
      console.log('PASS: branch/admin wrong-password 401 keeps login form and values without reload; IP block 429 displays without reload; sales has no highlight or badge on desktop/mobile; correct password opens workspace; protected 401 still returns expired branch session to login.');
      return;
    }
    if (process.env.UI_RECEIVING_CHECK === '1') {
      const requests = [
        {maYc: 101, maHang: inventory[0].maHang, soLuongDeXuat: 5, soLuongCoThe: null, soLuongGiao: null, soLuongNhan: null, trangThai: 'DA_DE_XUAT', capNhat: '2026-11-04 20:00:00'},
        {maYc: 102, maHang: inventory[1].maHang, soLuongDeXuat: 6, soLuongCoThe: 2, soLuongGiao: null, soLuongNhan: null, trangThai: 'THIEU_HANG', capNhat: '2026-11-04 20:01:00'},
        {maYc: 103, maHang: inventory[2].maHang, soLuongDeXuat: 4, soLuongCoThe: null, soLuongGiao: 4, soLuongNhan: null, trangThai: 'DA_GIAO', capNhat: '2026-11-04 20:02:00'},
      ];
      for (const width of [1440, 1024, 768, 390]) {
        state.requests = structuredClone(requests);
        await page.setViewportSize({width, height: 900});
        await page.goto(`${baseUrl}/branch/?receiving=${width}#view=offers`);
        await page.getByRole('heading', {name: 'Nhận hàng từ công ty', exact: true}).waitFor();
        const shipped = page.locator('.receiving-table tbody tr').filter({hasText: 'YC103'});
        const reject = shipped.getByRole('button', {name: 'Từ chối', exact: true});
        await reject.waitFor();
        assert.equal(await shipped.getByRole('button', {name: 'Đồng ý nhận hàng', exact: true}).isDisabled(), true);
        await page.screenshot({path: `tools/ui-redesign/after/receiving-${width}.png`, fullPage: true});
        const box = await reject.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width, `${width}: reject button is hidden outside the viewport`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        // Refusal does not require entering a quantity; cancelling the dialog does not send a request.
        const count = receivingDecisions.length;
        page.once('dialog', dialog => dialog.dismiss());
        await reject.click();
        assert.equal(receivingDecisions.length, count);
        page.once('dialog', dialog => dialog.accept());
        await reject.click();
        await shipped.waitFor({state: 'hidden'});
        assert.deepEqual(receivingDecisions.at(-1), {id: 103, action: 'reject', body: {}});
        assert.equal(receivingDecisions.length, count + 1);
        // Receiving remains a distinct operation with the counted quantity.
        state.requests = structuredClone(requests);
        broadcast();
        await shipped.getByRole('spinbutton').fill('4');
        await shipped.getByRole('button', {name: 'Đồng ý nhận hàng', exact: true}).click();
        await shipped.waitFor({state: 'hidden'});
        assert.deepEqual(receivingDecisions.at(-1), {id: 103, action: 'received', body: {soLuongNhan: 4}});
      }
      state.requests = structuredClone(requests);
      broadcast();
      const shipped = page.locator('.receiving-table tbody tr').filter({hasText: 'YC103'});
      await page.route('**/api/requests/103/reject', route => route.fulfill({status: 409, contentType: 'application/json', body: JSON.stringify({error: 'Yêu cầu vừa thay đổi. Vui lòng kiểm tra lại.'})}), {times: 1});
      page.once('dialog', dialog => dialog.accept());
      await shipped.getByRole('button', {name: 'Từ chối', exact: true}).click();
      await page.locator('.toast-error').waitFor();
      assert.equal(await shipped.getByRole('button', {name: 'Từ chối', exact: true}).isEnabled(), true);
      assert.equal(state.requests.find(row => row.maYc === 103).trangThai, 'DA_GIAO');
      state.canRejectDelivered = false;
      broadcast();
      await page.waitForFunction(() => Array.from(document.querySelectorAll('.receiving-table button')).some(button => button.title.includes('bản mới') && button.disabled));
      assert.deepEqual(errors, []);
      console.log('PASS: delivered goods have accept/refuse buttons at 1440/1024/768/390px; refusal without quantity; cancel sends nothing; correct reject/receipt payloads; errors keep request open; no overflow or browser exceptions.');
      return;
    }
    if (process.env.UI_FILTER_CHECK === '1') {
      for (const width of [1440, 1024, 768, 390]) {
        await page.setViewportSize({width, height: 760});
        await page.goto(`${baseUrl}/branch/`);
        await page.getByRole('heading', {name: 'Bán hàng & tồn kho', exact: true}).waitFor();
        if (width === 1024) await page.getByRole('button', {name: 'Xem dạng bảng', exact: true}).click();
        const filters = page.getByRole('complementary', {name: 'Bộ lọc sản phẩm'});
        if (width < 1000) await filters.locator('summary').click();
        await page.waitForFunction(() => {
          const element = document.querySelector('.sales-filters');
          return element.scrollHeight > element.clientHeight + 100;
        });
        await filters.evaluate(element => { element.scrollTop = 0; });
        const box = await filters.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + Math.min(150, box.height / 2));
        const pageY = await page.evaluate(() => scrollY);
        await page.mouse.wheel(0, 500);
        await page.waitForFunction(() => document.querySelector('.sales-filters').scrollTop > 100);
        assert.equal(await page.evaluate(() => scrollY), pageY, `${width}: filter wheel must not scroll the catalog`);
        if (width >= 1000) {
          const catalog = await page.locator('.sales-catalog').boundingBox();
          await page.mouse.move(catalog.x + catalog.width / 2, 400);
          await page.mouse.wheel(0, 650);
          await page.waitForFunction(() => scrollY > 100);
        }
        // Exercise the lower choices, where a shortened catalog used to disturb scrolling.
        const level = filters.locator('.filter-group').filter({hasText: 'Mức tồn'}).getByRole('radio').nth(3);
        await level.scrollIntoViewIfNeeded();
        const scrollBefore = await filters.evaluate(element => element.scrollTop);
        await level.check();
        await page.waitForFunction(() => document.querySelectorAll('.product-card, .sales-table tbody tr').length === 5);
        assert.ok(Math.abs(await filters.evaluate(element => element.scrollTop) - scrollBefore) <= 2, `${width}: selection reset filter scroll`);
        const supply = filters.locator('.filter-group').filter({hasText: 'Nhập hàng'}).getByRole('radio').nth(1);
        await supply.scrollIntoViewIfNeeded();
        const emptyBefore = await filters.evaluate(element => element.scrollTop);
        await supply.check();
        await page.getByText('Không có mặt hàng nào khớp bộ lọc.', {exact: true}).waitFor();
        assert.ok(Math.abs(await filters.evaluate(element => element.scrollTop) - emptyBefore) <= 2, `${width}: empty results reset filter scroll`);
        const originalThreshold = inventory[0].nguong;
        inventory[0].nguong = inventory[0].soLuong + 1;
        broadcast();
        await page.locator('.sales-results > span:last-child').filter({hasText: '6 mặt hàng dưới ngưỡng'}).waitFor();
        assert.ok(Math.abs(await filters.evaluate(element => element.scrollTop) - emptyBefore) <= 2, `${width}: refresh reset filter scroll`);
        inventory[0].nguong = originalThreshold;
        broadcast();
        await page.screenshot({path: `tools/ui-redesign/after/filters-${width}.png`, fullPage: true});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
      await page.setViewportSize({width: 1440, height: 900});
      await page.goto(`${baseUrl}/branch/`);
      await page.getByRole('button', {name: '+ Thêm vào giỏ', exact: true}).first().click();
      const refreshed = page.waitForResponse(response => response.url().endsWith('/api/inventory/refresh') && response.request().method() === 'POST');
      await page.reload();
      assert.equal((await refreshed).ok(), true);
      await page.getByRole('button', {name: 'Giỏ hàng (1)', exact: true}).waitFor();
      assert.equal(await page.locator('.sales-toolbar').getByRole('button', {name: 'Tải lại', exact: true}).count(), 0);
      await page.getByRole('button', {name: /Giỏ hàng/}).click();
      await page.getByRole('button', {name: /Tiến hành thanh toán/}).click();
      await page.locator('.payment-qr img').waitFor();
      const paymentCopy = await page.locator('.checkout-page').innerText();
      assert.doesNotMatch(paymentCopy, /client|thủ công|QR MẪU|Mã mẫu|Một lần quét/i);
      await page.screenshot({path: 'tools/ui-redesign/after/payment-clean.png', fullPage: true});
      assert.equal(await page.locator('.workspace-context, .page-description, .page-breadcrumb').count(), 0);
      await page.getByRole('button', {name: 'Xác nhận thanh toán', exact: true}).click();
      await page.locator('.invoice-paper').waitFor();
      assert.doesNotMatch(await page.locator('.invoice-paper').innerText(), /client|thủ công/i);
      await page.goto(`${baseUrl}/admin/`);
      assert.equal(await page.locator('.workspace-context, .page-description, .page-breadcrumb').count(), 0);
      assert.doesNotMatch(await page.locator('.appbar').innerText(), /server|client/i);
      assert.deepEqual(errors, []);
      console.log('PASS: 31 products; independent filter wheel and preserved scroll after selection, empty results and live updates at 1440/1024/768/390px; no inventory reload button; page reload requests fresh inventory and retains cart; concise payment/invoice/header copy; no overflow or browser exceptions.');
      return;
    }
    if (process.env.UI_NAVIGATION_CHECK === '1') {
      let adminAllowed = true;
      await page.route('**/api/auth/me', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({loggedIn: adminAllowed, user: adminAllowed ? 'admin' : null})}));
      await page.goto(`${baseUrl}/admin/`);
      await page.getByRole('heading', {name: 'Tổng quan', exact: true}).waitFor();
      await navigate('Hàng hóa');
      await navigate('Kho chi nhánh');
      await page.goBack();
      await page.getByRole('heading', {name: 'Hàng hóa & kho tổng', exact: true}).waitFor();
      await page.goForward();
      await page.getByRole('heading', {name: 'Quản lý kho chi nhánh', exact: true}).waitFor();
      await page.reload();
      await page.getByRole('heading', {name: 'Quản lý kho chi nhánh', exact: true}).waitFor();
      await page.getByRole('button', {name: '← Quay lại', exact: true}).click();
      await page.getByRole('heading', {name: 'Hàng hóa & kho tổng', exact: true}).waitFor();
      assert.equal(new URL(page.url()).hash, '#view=products');
      adminAllowed = false;
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true})));
      await page.locator('input[type="password"]').waitFor();
      assert.equal(await page.locator('.workspace-shell').count(), 0);
      adminAllowed = true;
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted: true})));
      await page.getByRole('heading', {name: 'Hàng hóa & kho tổng', exact: true}).waitFor();
      // Direct links are restored, but a missing in-app parent falls back to the root view.
      await page.goto(`${baseUrl}/admin/#view=debts`);
      await page.getByRole('heading', {name: 'Công nợ', exact: true}).waitFor();
      await page.getByRole('button', {name: '← Quay lại', exact: true}).click();
      await page.getByRole('heading', {name: 'Tổng quan', exact: true}).waitFor();
      await page.goto(`${baseUrl}/branch/`);
      await navigate('Đặt ngưỡng');
      await navigate('Nhật ký');
      await page.goBack();
      await page.getByRole('heading', {name: 'Đặt ngưỡng', exact: true}).waitFor();
      await page.goForward();
      await page.getByRole('heading', {name: 'Nhật ký hoạt động', exact: true}).waitFor();
      await page.goto(`${baseUrl}/branch/`);
      await page.getByRole('button', {name: '+ Thêm vào giỏ', exact: true}).first().click();
      await page.getByRole('button', {name: /Giỏ hàng/}).click();
      await page.getByRole('button', {name: /Tiến hành thanh toán/}).click();
      let releasePayment, paymentStarted;
      const gate = new Promise(resolve => { releasePayment = resolve; });
      const started = new Promise(resolve => { paymentStarted = resolve; });
      await page.route('**/api/checkout/*/confirm', async route => { paymentStarted(); await gate; await route.continue(); });
      try {
        await page.getByRole('button', {name: 'Xác nhận thanh toán', exact: true}).click();
        await started;
        await page.waitForFunction(() => document.querySelector('.menu-toggle')?.disabled === true);
        await page.goBack();
        await page.waitForFunction(() => location.hash === '#view=cart');
        await page.getByRole('heading', {name: 'Giỏ hàng & thanh toán', exact: true}).waitFor();
      } finally { releasePayment(); }
      await page.getByRole('button', {name: '← Quay lại bán hàng', exact: true}).waitFor();
      // Switching portals replaces the chooser entry instead of adding it behind the workspace.
      await page.goto(`${baseUrl}/branch/?previous=workspace`);
      adminAllowed = false;
      await page.goto(`${baseUrl}/admin/`);
      await page.getByRole('tab', {name: 'Chi nhánh', exact: true}).click();
      const portal = page.getByRole('link', {name: 'Mở trang đăng nhập chi nhánh', exact: true});
      await portal.evaluate((element, url) => { element.href = url; }, `${baseUrl}/branch/`);
      await portal.click();
      await page.getByRole('heading', {name: 'Bán hàng & tồn kho', exact: true}).waitFor();
      await page.goBack();
      await page.getByRole('heading', {name: 'Bán hàng & tồn kho', exact: true}).waitFor();
      assert.equal(new URL(page.url()).pathname, '/branch/');
      assert.equal(new URL(page.url()).search, '?previous=workspace');
      assert.deepEqual(errors, []);
      console.log('PASS: browser Back/Forward navigates admin and branch views; refresh restores view; in-app back survives reload; direct-link fallback; cached pages recheck live/expired sessions; pending payment stays on screen; portal switch replaces chooser history; no browser exceptions.');
      return;
    }
    if (process.env.UI_HEADER_CHECK === '1') {
      for (const width of [1440, 390]) {
        await page.setViewportSize({width, height: 1000});
        for (const role of ['branch', 'admin']) {
          if (role === 'branch') state.inbox = [{id: 9001, loai: 'TIN', trangThai: 'DA_GUI', taoLuc: new Date().toISOString(), tieuDe: 'Thông báo kiểm thử', noiDung: 'Kiểm tra mở thông báo từ thanh đầu trang.', maSp: '', deXuat: null, soLuong: null, maYc: null, anh: ''}];
          await page.goto(`${baseUrl}/${role}/`);
          await page.locator('.subbar h1').waitFor();
          const bell = page.locator('.appbar .header-notification');
          await bell.waitFor();
          assert.equal(await page.locator('.sidebar-nav button, .drawer-nav button').filter({hasText: 'Thông báo'}).count(), 0);
          assert.equal(await bell.innerText(), role === 'branch' ? '1' : '');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          const box = await bell.boundingBox();
          assert(box.x > width / 2 && box.x + box.width <= width);
          await page.screenshot({path: `tools/ui-redesign/after/notification-${role}-${width}.png`, fullPage: true});
          await bell.click();
          await page.getByRole('heading', {name: role === 'branch' ? 'Thông báo từ công ty' : 'Thông báo tới chi nhánh', exact: true}).waitFor();
          if (role === 'branch') await bell.locator('.header-notification-count').waitFor({state: 'hidden'});
          await page.getByRole('button', {name: '← Quay lại', exact: true}).click();
          await page.getByRole('heading', {name: role === 'branch' ? 'Bán hàng & tồn kho' : 'Tổng quan', exact: true}).waitFor();
        }
      }
      console.log('PASS: one bell icon at top right for branch/admin, no duplicate menu entries, unread badge clears after reading, open/back navigation, desktop/mobile, no horizontal overflow.');
      return;
    }
    await page.goto(`${baseUrl}/branch/`);
    await page.locator('.product-card').first().waitFor();
    assert.equal(await page.locator('.product-card').count(), 6);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(245, 247, 250)');
    await page.getByRole('searchbox', {name: 'Tìm mặt hàng'}).fill('TB02');
    assert.equal(await page.locator('.product-card').count(), 1);
    await page.getByRole('searchbox', {name: 'Tìm mặt hàng'}).fill('nothing_matches');
    await page.getByText('Không có mặt hàng nào khớp bộ lọc.', {exact: true}).waitFor();
    await page.getByRole('button', {name: 'Xóa bộ lọc', exact: true}).click();
    await page.getByRole('combobox', {name: 'Sắp xếp sản phẩm'}).selectOption('giaBanLe:1');
    assert.equal((await page.locator('.product-card-code').first().innerText()).startsWith('TB01'), true);
    await page.getByRole('button', {name: 'Xem dạng bảng', exact: true}).click();
    await page.getByRole('columnheader', {name: 'Số lượng', exact: true}).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 6);
    await page.getByRole('button', {name: 'Xem dạng thẻ', exact: true}).click();
    await page.getByRole('button', {name: 'Thu gọn menu', exact: true}).click();
    assert.equal(await page.locator('.app-sidebar').evaluate(el => el.getBoundingClientRect().width), 80);
    await page.getByRole('button', {name: 'Mở rộng menu', exact: true}).click();
    assert.equal(await page.getByRole('columnheader', { name: /Ngưỡng tối thiểu/ }).count(), 0);
    assert.equal(await page.getByRole('button', { name: /Giỏ hàng/ }).count(), 1);
    const toolbar = page.locator('.card-head').first();
    const cartBox = await toolbar.getByRole('button', {name: /Giỏ hàng/}).boundingBox();
    assert.equal(await toolbar.getByRole('button', {name: 'Tải lại', exact: true}).count(), 0);
    const toolbarBox = await toolbar.boundingBox();
    assert(toolbarBox.x + toolbarBox.width - (cartBox.x + cartBox.width) < 25);
    await page.screenshot({ path: 'tools/navigation-preview/stock-desktop.png', fullPage: true });
    await openMenu();
    assert.equal(await page.locator('.app-sidebar').getByRole('button', { name: /Giỏ hàng/ }).count(), 0);
    await page.screenshot({ path: 'tools/navigation-preview/menu-desktop.png', fullPage: true });
    await navigate('Đặt ngưỡng');
    const row = page.locator('tbody tr').filter({ has: page.getByLabel('Ngưỡng TB01', { exact: true }) });
    for (const invalid of ['-1', '1.5', '2147483648', '']) {
      await row.getByRole('spinbutton').fill(invalid);
      assert.equal(await row.getByRole('button', { name: 'Lưu', exact: true }).isDisabled(), true);
    }
    await row.getByRole('spinbutton').fill('5');
    await row.getByRole('button', { name: 'Lưu', exact: true }).click();
    await row.getByText('Dưới ngưỡng', { exact: true }).waitFor();
    assert.deepEqual(changes, [{ maHang: 'TB01', nguong: 5 }]);
    await page.screenshot({ path: 'tools/navigation-preview/thresholds-desktop.png', fullPage: true });
    await page.getByRole('button', { name: '← Quay lại', exact: true }).click();
    await page.locator('.product-card').first().waitFor();
    await page.getByRole('button', { name: '+ Thêm vào giỏ', exact: true }).first().click();
    await page.getByRole('button', {name: /Giỏ hàng/}).click();
    await page.getByRole('button', { name: '← Tiếp tục chọn hàng', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '+ Thêm sản phẩm', exact: true }).count(), 0);
    await page.getByRole('button', { name: '← Tiếp tục chọn hàng', exact: true }).click();
    await page.getByRole('button', {name: /Giỏ hàng/}).click();
    await page.getByRole('button', { name: /Tiến hành thanh toán/ }).click();
    await page.getByRole('button', { name: /Quay lại sửa giỏ hàng/ }).click();
    await page.getByRole('button', { name: '← Tiếp tục chọn hàng', exact: true }).waitFor();
    await page.getByRole('button', { name: /Tiến hành thanh toán/ }).click();
    await page.getByRole('button', { name: 'Xác nhận thanh toán', exact: true }).evaluate(button => { button.click(); button.click(); });
    await page.getByRole('button', { name: '← Quay lại bán hàng', exact: true }).waitFor();
    assert.equal(confirms, 1);
    assert.deepEqual(createdBodies.at(-1).items, [{maHang: 'TB01', soLuong: 1}]);
    assert.equal(orders.get(createdBodies.at(-1).id).total, 1090000);
    await page.locator('.toast').evaluateAll(elements => elements.forEach(element => element.click()));
    await page.screenshot({path: 'tools/ui-redesign/after/invoice.png', fullPage: true});
    await page.pdf({path: 'tools/ui-redesign/after/invoice.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true});
    await navigate('Hóa đơn');
    await page.getByRole('button', { name: 'Xem hóa đơn', exact: true }).click();
    await page.getByRole('button', { name: '← Danh sách hóa đơn', exact: true }).click();
    await page.getByRole('button', { name: '← Quay lại', exact: true }).click();
    await page.getByRole('button', { name: '← Quay lại bán hàng', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await openMenu();
    await page.screenshot({ path: 'tools/navigation-preview/menu-mobile.png', fullPage: true });
    await page.getByRole('dialog').getByRole('button', { name: 'Đặt ngưỡng' }).click();
    await page.getByRole('columnheader', { name: /Ngưỡng tối thiểu/ }).waitFor();
    await page.screenshot({ path: 'tools/navigation-preview/thresholds-mobile.png', fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.emulateMedia({ colorScheme: 'light' });
    await openMenu();
    await page.screenshot({ path: 'tools/navigation-preview/menu-light.png', fullPage: true });
    await page.keyboard.press('Escape');
    await page.setViewportSize({width: 1440, height: 1000});
    await page.emulateMedia({colorScheme: 'dark'});
    await page.goto(`${baseUrl}/admin/`);
    await page.getByRole('heading', {name: 'Tổng quan', exact: true}).waitFor();
    assert.equal(await page.locator('.appbar-nav').count(), 0);
    await page.screenshot({path: 'tools/navigation-preview/admin-overview.png', fullPage: true});
    await openMenu();
    assert.equal(await page.getByRole('navigation', {name: 'Chức năng quản trị'}).count(), 1);
    await page.screenshot({path: 'tools/navigation-preview/admin-menu.png', fullPage: true});
    await page.locator('.app-sidebar').getByRole('button', {name: 'Đặt ngưỡng', exact: true}).click();
    await page.getByRole('columnheader', {name: 'Ngưỡng tối thiểu', exact: true}).waitFor();
    await page.locator('tbody tr').first().waitFor();
    assert.equal(await page.locator('tbody tr').count(), 6);
    await page.getByRole('searchbox').fill('TB02');
    assert.equal(await page.locator('tbody tr').count(), 1);
    await page.getByRole('button', {name: 'Xoá lọc'}).click();
    await page.screenshot({path: 'tools/navigation-preview/admin-thresholds.png', fullPage: true});
    await navigate('Kho chi nhánh');
    await page.locator('.wh-card').first().click();
    await page.getByRole('heading', {name: /Kho CN01/}).waitFor();
    assert.equal(await page.getByRole('button', {name: '← Tất cả chi nhánh', exact: true}).count(), 1);
    assert.equal(await page.locator('thead th').filter({hasText: /^Ngưỡng$/}).count(), 0);
    const stockRow = page.locator('tbody tr').filter({has: page.locator('td.code', {hasText: 'TB01'})}).first();
    assert.equal(await stockRow.locator('td').count(), 8);
    await page.screenshot({path: 'tools/navigation-preview/admin-warehouse.png', fullPage: true});
    await page.getByRole('button', {name: '← Tất cả chi nhánh', exact: true}).click();
    await page.locator('.wh-card').first().waitFor();
    await page.getByRole('button', {name: '← Quay lại', exact: true}).click();
    await page.getByRole('heading', {name: 'Đặt ngưỡng', exact: true}).waitFor();
    await page.getByRole('button', {name: '← Quay lại', exact: true}).click();
    await navigate('Hàng hóa');
    await page.getByRole('searchbox', {name: 'Tìm hàng hóa'}).fill('TB02');
    assert.equal(await page.locator('tbody tr').count(), 1);
    await page.getByRole('searchbox', {name: 'Tìm hàng hóa'}).fill('');
    await page.getByRole('button', {name: 'Sửa', exact: true}).first().click();
    await page.getByRole('button', {name: '← Hủy chỉnh sửa', exact: true}).click();
    await page.getByRole('heading', {name: 'Thêm hàng hóa', exact: true}).waitFor();
    await page.getByRole('button', {name: '← Quay lại', exact: true}).click();
    await navigate('Công nợ');
    await page.locator('tbody tr').filter({hasText: 'CN01'}).first().click();
    await page.getByRole('heading', {name: /Sổ công nợ CN01/}).waitFor();
    await page.getByRole('button', {name: 'Ghi phiếu thu', exact: true}).click();
    assert.equal(await page.getByRole('button', {name: 'Ghi phiếu thu', exact: true}).count(), 0);
    await page.getByRole('button', {name: '← Danh sách công nợ chi nhánh', exact: true}).click();
    await page.getByRole('button', {name: 'Nhà cung cấp', exact: true}).click();
    await page.locator('tbody tr').filter({hasText: 'NCC01'}).first().click();
    await page.getByRole('heading', {name: /Sổ nhà cung cấp NCC01/}).waitFor();
    await page.getByRole('button', {name: '← Danh sách công nợ nhà cung cấp', exact: true}).click();
    await page.getByRole('button', {name: '← Quay lại', exact: true}).click();
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await openMenu();
    await page.screenshot({path: 'tools/navigation-preview/admin-menu-mobile.png', fullPage: true});
    await page.getByRole('dialog').getByRole('button', {name: 'Đặt ngưỡng', exact: true}).click();
    await page.locator('tbody tr').first().waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.emulateMedia({colorScheme: 'light'});
    await openMenu();
    await page.screenshot({path: 'tools/navigation-preview/admin-menu-light.png', fullPage: true});
    await page.keyboard.press('Escape');
    await fs.mkdir('tools/ui-redesign/screens', {recursive: true});
    const screens = {
      admin: ['Tổng quan', 'Hàng hóa', 'Kho chi nhánh', 'Đặt ngưỡng', 'Công nợ', 'Yêu cầu cấp hàng', 'Điều chuyển', 'Thông báo', 'Giám sát', 'Đối soát'],
      branch: ['Bán hàng', 'Hóa đơn', 'Đặt ngưỡng', 'Nhận hàng', 'Điều chuyển', 'Công nợ', 'Thông báo', 'Lịch sử nhập', 'Nhật ký', 'An ninh'],
    };
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({width, height: 1000});
      for (const [role, tabs] of Object.entries(screens)) {
        await page.goto(`${baseUrl}/${role}/`);
        await page.locator('.subbar h1').waitFor();
        for (const [index, label] of tabs.entries()) {
          await navigate(new RegExp(`^${label}( \\([0-9]+\\))?$`));
          await page.locator('.subbar h1').waitFor();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${role}/${label} ${width}px overflow`);
          await page.screenshot({path: `tools/ui-redesign/screens/${role}-${index}-${width}.png`, fullPage: true});
        }
      }
    }
    // A failed read must be visible and retryable without changing the contract.
    await page.route('**/api/products', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: 'Kết nối thử nghiệm bị gián đoạn'})}), {times: 1});
    await page.goto(`${baseUrl}/admin/`);
    await page.getByRole('alert').filter({hasText: 'Không tải được một phần dữ liệu.'}).waitFor();
    await page.getByRole('button', {name: 'Thử tải lại', exact: true}).click();
    await page.getByRole('alert').filter({hasText: 'Không tải được một phần dữ liệu.'}).waitFor({state: 'hidden'});
    await page.route('**/api/auth/me', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({loggedIn: false})}));
    await page.reload();
    await page.locator('input[type="password"]').waitFor();
    await page.screenshot({path: 'tools/ui-redesign/after/login-390.png', fullPage: true});
    await page.setViewportSize({width: 1440, height: 1000});
    await page.screenshot({path: 'tools/ui-redesign/after/login-1440.png', fullPage: true});
    assert.deepEqual(errors, []);
    console.log('PASS: light default under OS dark; grid/table/search/sort; sidebar collapse and mobile drawer; cart at right without reload button; unchanged checkout payload/total; double-click confirms once; PDF export; thresholds; admin search/edit/back/ledgers; 20 modules at 1440/1024/768/390px without overflow; visible read error + retry; login layout/guard; no browser exceptions.');
  } finally {
    await browser.close();
    for (const res of peers) res.end();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
