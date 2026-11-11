const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '../tools/browser-check/node_modules/playwright');
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
        const subtotal = items.reduce((n, i) => n + i.thanhTien, 0);
        const vatAmount = Math.floor(subtotal / 10) + (subtotal % 10 >= 5 ? 1 : 0);
        const order = { id: request.id, customer: request.customer, maCn: 'CN01', tenCn: state.tenCn, status: 'PENDING', createdAt: new Date().toISOString(), subtotal, vatRate: 10, vatAmount, total: subtotal + vatAmount, quantity: items.reduce((n,i) => n + i.soLuong, 0), items };
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
    if (process.env.UI_VAT_CHECK === '1') {
      await fs.mkdir('ui/artifacts', {recursive: true});
      const money = amount => `${amount.toLocaleString('vi-VN')} đ`;
      const fits = async label => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, label);
      const summary = async subtotal => {
        const panel = page.locator('.checkout-summary');
        const vat = Number((BigInt(subtotal) + 5n) / 10n);
        assert.equal(await panel.locator('.checkout-summary-row').filter({hasText: 'Tiền hàng'}).locator('b').innerText(), money(subtotal));
        assert.equal(await panel.locator('.checkout-summary-row').filter({hasText: 'VAT 10%'}).locator('b').innerText(), money(vat));
        assert.equal(await panel.locator('.checkout-total strong').innerText(), money(subtotal + vat));
        return subtotal + vat;
      };
      for (const width of [1440,768,390]) {
        await context.clearCookies(); await page.goto(baseUrl + '/branch/');
        await page.evaluate(() => localStorage.clear()); await page.reload();
        await page.setViewportSize({width,height:1000});
        await page.locator('.product-card').first().waitFor();
        for (let index = 0; index < 2; index++) await page.locator('.product-card').nth(index).getByRole('button', {name: '+ Thêm hàng', exact: true}).click();
        await page.locator('.header-cart').click();
        await page.getByRole('button', {name: /Tiến hành thanh toán/}).waitFor();
        await summary(inventory[0].giaBanLe + inventory[1].giaBanLe);
        await page.getByLabel(`Số lượng ${inventory[0].maHang}`, {exact:true}).fill('2');
        const subtotal = 2 * inventory[0].giaBanLe + inventory[1].giaBanLe;
        const total = await summary(subtotal);
        await fits(`cart ${width}`);
        if(width !== 768) await page.screenshot({path:`ui/artifacts/checkout-vat-cart-${width}.png`,fullPage:true});
        await page.getByRole('button', {name: /Tiến hành thanh toán/}).click();
        await page.locator('.payment-qr img').waitFor(); await summary(subtotal);
        assert.equal(await page.locator('.payment-amount').innerText(),money(total));
        const order = orders.get(createdBodies.at(-1).id);
        assert.equal(order.total,total); assert.equal(order.subtotal,subtotal);
        assert.equal(order.vatRate,10); assert.equal(order.vatAmount,total-subtotal);
        assert.deepEqual(Object.keys(createdBodies.at(-1)).sort(),['customer','id','items']);
        await page.reload(); await page.locator('.payment-qr img').waitFor();
        await summary(subtotal); await fits(`payment ${width}`);
        if(width !== 768) await page.screenshot({path:`ui/artifacts/checkout-vat-payment-${width}.png`,fullPage:true});
        const before = confirms;
        await page.getByRole('button', {name:'Xác nhận thanh toán',exact:true}).evaluate(button=>{button.click();button.click();});
        await page.locator('.invoice-paper').waitFor();
        assert.equal(confirms,before+1);
        const invoice = page.locator('.invoice-totals');
        assert.equal(await invoice.locator('div').filter({has:page.locator('span', {hasText:/^Tiền hàng$/})}).filter({has:page.locator('b')}).last().locator('b').innerText(),money(subtotal));
        assert.match(await invoice.innerText(),/VAT 10%/);
        assert.equal(await invoice.locator('div').filter({has:page.locator('span', {hasText:/^VAT 10%$/})}).filter({has:page.locator('b')}).last().locator('b').innerText(),money(total-subtotal));
        assert.equal(await page.locator('.invoice-grand-total strong').innerText(),money(total));
        await fits(`invoice ${width}`);
        if(width !== 768) await page.screenshot({path:`ui/artifacts/checkout-vat-invoice-${width}.png`,fullPage:true});
        if(width===1440) await page.pdf({path:'ui/artifacts/checkout-vat-invoice.pdf',format:'A4',printBackground:true,preferCSSPageSize:true});
        await page.goto(baseUrl+'/branch/#view=invoices');
        await page.getByRole('button',{name:'Xem hóa đơn',exact:true}).last().waitFor();
        await page.getByRole('button',{name:'Xem hóa đơn',exact:true}).last().click();
        await page.locator('.invoice-paper').waitFor();
        assert.equal(await page.locator('.invoice-grand-total strong').innerText(),money(total));
        assert.match(await page.locator('.invoice-totals').innerText(),/VAT 10%/);
      }
      // Previously stored pending and paid invoices retain their original tax-free totals.
      const legacy = {...orders.values().next().value, id:'HD'+'a'.repeat(32), status:'PENDING', total:500};
      delete legacy.subtotal; delete legacy.vatRate; delete legacy.vatAmount;
      orders.set(legacy.id,legacy);
      await page.evaluate(id=>localStorage.setItem('toboki-checkout:CN01',id),legacy.id);
      await page.goto(baseUrl+'/branch/#view=cart'); await page.locator('.payment-amount').waitFor();
      assert.equal(await page.locator('.payment-amount').innerText(),money(500));
      assert.doesNotMatch(await page.locator('.checkout-summary').innerText(),/VAT/);
      await page.getByRole('button',{name:'Xác nhận thanh toán',exact:true}).click();
      await page.locator('.invoice-paper').waitFor();
      assert.equal(await page.locator('.invoice-grand-total strong').innerText(),money(500));
      assert.doesNotMatch(await page.locator('.invoice-totals').innerText(),/VAT/);
      assert.deepEqual(errors,[]);
      console.log('PASS: VAT 10% in cart, quantity changes, payment/QR amount, restored order, single confirmation, invoice history/PDF at 1440/768/390px; old invoices preserve their totals.');
      return;
    }
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
          if (phase === 'after') assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(245, 246, 247)');
        }
      }
      console.log(`${phase}: captured admin and branch at 1440, 1024, 768 and 390px; no horizontal overflow.`);
      return;
    }
    const openMenu = async () => {
      const trigger = page.getByRole('button', {name: 'Tất cả chức năng', exact: true});
      if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
      await page.locator('.functions-dropdown.is-open').waitFor();
    };
    const navigate = async label => {
      if (typeof label === 'string' ? label === 'Thông báo' : label.test('Thông báo')) { await page.locator('.header-notification').click(); return; }
      if (label === 'Giỏ hàng') { await page.locator('.header-cart').click(); return; }
      if (label === 'Bán hàng') label = 'Sản phẩm';
      await openMenu();
      for (const group of await page.locator('.functions-group').all()) {
        const target = group.getByRole('button', {name: label, exact: typeof label === 'string', includeHidden: true});
        if (!await target.count()) continue;
        const toggle = group.locator('.functions-group-toggle');
        if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
        await target.click();
        await page.locator('.functions-dropdown').waitFor({state: 'hidden'});
        return;
      }
      throw new Error(`Không tìm thấy chức năng: ${label}`);
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
        await page.getByRole('heading', {name: role === 'branch' ? 'Bán hàng & tồn kho' : 'Tổng quan vận hành', exact: true}).waitFor();
        if (role === 'branch') {
          for (const width of [1440, 390]) {
            await page.setViewportSize({width, height: 900});
            await openMenu();
            const sales = page.locator('.functions-dropdown').getByRole('button', {name: 'Sản phẩm', exact: true});
            assert.equal(await sales.getAttribute('aria-current'), 'page');
            assert.equal(await sales.evaluate(element => element.classList.contains('active')), true);
            assert.equal(await sales.locator('.nav-count').count(), 0);
            await page.keyboard.press('Escape');
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
      console.log('PASS: branch/admin wrong-password 401 keeps login form and values without reload; IP block 429 displays without reload; active sales view has no badge on desktop/mobile; correct password opens workspace; protected 401 still returns expired branch session to login.');
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
        const filters = page.getByRole('region', {name: 'Bộ lọc sản phẩm', exact: true});
        const categories = page.getByRole('complementary', {name: 'Danh mục sản phẩm', exact: true});
        await filters.waitFor();
        if (width <= 600) await filters.locator('.sales-filter-toggle').click();
        const filterBox = await filters.boundingBox();
        const resultsBox = await page.locator('.sales-toolbar').boundingBox();
        assert(filterBox.y + filterBox.height <= resultsBox.y, `${width}: filters must precede results`);
        if (width >= 900) {
          const categoryBox = await categories.boundingBox();
          assert(categoryBox.x + categoryBox.width <= filterBox.x, `${width}: picture categories belong on the left`);
        } else {
          assert.equal(await categories.getByRole('button', {name: /Danh mục sản phẩm/}).getAttribute('aria-expanded'), 'false');
        }
        await filters.getByRole('combobox', {name: 'Mức tồn', exact: true}).selectOption('unset');
        await page.waitForFunction(() => document.querySelectorAll('.product-card, .sales-table tbody tr').length === 5);
        await filters.getByRole('combobox', {name: 'Nhập hàng', exact: true}).selectOption('waiting');
        await page.getByText('Không có mặt hàng nào khớp bộ lọc.', {exact: true}).waitFor();
        const originalThreshold = inventory[0].nguong;
        inventory[0].nguong = inventory[0].soLuong + 1;
        broadcast();
        await page.locator('.sales-results > span:last-child').filter({hasText: '6 mặt hàng dưới ngưỡng'}).waitFor();
        assert.equal(await filters.getByRole('combobox', {name: 'Mức tồn', exact: true}).inputValue(), 'unset');
        inventory[0].nguong = originalThreshold;
        broadcast();
        await page.screenshot({path: `tools/ui-redesign/after/filters-${width}.png`, fullPage: true});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      }
      await page.setViewportSize({width: 1440, height: 900});
      await page.goto(`${baseUrl}/branch/`);
      await page.getByRole('button', {name: '+ Thêm hàng', exact: true}).first().click();
      const refreshed = page.waitForResponse(response => response.url().endsWith('/api/inventory/refresh') && response.request().method() === 'POST');
      await page.reload();
      assert.equal((await refreshed).ok(), true);
      await page.getByRole('button', {name: 'Giỏ hàng (1 sản phẩm)', exact: true}).waitFor();
      assert.equal(await page.locator('.sales-toolbar').getByRole('button', {name: 'Tải lại', exact: true}).count(), 0);
      await page.getByRole('button', {name: /Giỏ hàng/}).click();
      await page.getByRole('button', {name: /Tiến hành thanh toán/}).click();
      await page.locator('.payment-qr img').waitFor();
      const paymentCopy = await page.locator('.checkout-page').innerText();
      assert.doesNotMatch(paymentCopy, /client|thủ công|QR MẪU|Mã mẫu|Một lần quét/i);
      await page.screenshot({path: 'tools/ui-redesign/after/payment-clean.png', fullPage: true});
      assert.equal(await page.locator('.workspace-context, .page-breadcrumb').count(), 0);
      await page.getByRole('button', {name: 'Xác nhận thanh toán', exact: true}).click();
      await page.locator('.invoice-paper').waitFor();
      assert.doesNotMatch(await page.locator('.invoice-paper').innerText(), /client|thủ công/i);
      await page.goto(`${baseUrl}/admin/`);
      assert.equal(await page.locator('.workspace-context, .page-breadcrumb').count(), 0);
      assert.doesNotMatch(await page.locator('.appbar').innerText(), /server|client/i);
      assert.deepEqual(errors, []);
      console.log('PASS: 31 products; independent filter wheel and preserved scroll after selection, empty results and live updates at 1440/1024/768/390px; no inventory reload button; page reload requests fresh inventory and retains cart; concise payment/invoice/header copy; no overflow or browser exceptions.');
      return;
    }
    if (process.env.UI_NAVIGATION_CHECK === '1') {
      let adminAllowed = true;
      await page.route('**/api/auth/me', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({loggedIn: adminAllowed, user: adminAllowed ? 'admin' : null})}));
      await page.goto(`${baseUrl}/admin/`);
      await page.getByRole('heading', {name: 'Tổng quan vận hành', exact: true}).waitFor();
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
      await page.getByRole('heading', {name: 'Tổng quan vận hành', exact: true}).waitFor();
      await page.goto(`${baseUrl}/branch/`);
      await navigate('Đặt ngưỡng');
      await navigate('Nhật ký');
      await page.goBack();
      await page.getByRole('heading', {name: 'Đặt ngưỡng', exact: true}).waitFor();
      await page.goForward();
      await page.getByRole('heading', {name: 'Nhật ký hoạt động', exact: true}).waitFor();
      await page.goto(`${baseUrl}/branch/`);
      await page.getByRole('button', {name: '+ Thêm hàng', exact: true}).first().click();
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
          assert.equal(await page.locator('.functions-group-links button').filter({hasText: 'Thông báo'}).count(), 0);
          assert.equal(await bell.innerText(), role === 'branch' ? '1' : '');
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          const box = await bell.boundingBox();
          assert(box.x > width / 2 && box.x + box.width <= width);
          await page.screenshot({path: `tools/ui-redesign/after/notification-${role}-${width}.png`, fullPage: true});
          await bell.click();
          await page.getByRole('heading', {name: role === 'branch' ? 'Thông báo từ công ty' : 'Thông báo tới chi nhánh', exact: true}).waitFor();
          if (role === 'branch') await bell.locator('.header-notification-count').waitFor({state: 'hidden'});
          await page.getByRole('button', {name: '← Quay lại', exact: true}).click();
          await page.getByRole('heading', {name: role === 'branch' ? 'Bán hàng & tồn kho' : 'Tổng quan vận hành', exact: true}).waitFor();
        }
      }
      console.log('PASS: one bell icon at top right for branch/admin, no duplicate menu entries, unread badge clears after reading, open/back navigation, desktop/mobile, no horizontal overflow.');
      return;
    }
    await page.goto(baseUrl + '/branch/');
    await page.locator('.product-card').first().waitFor();
    assert.equal(await page.locator('.product-card').count(), 6);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(245, 246, 247)');
    const search = page.getByRole('searchbox', {name: 'Tìm kiếm hàng hóa', exact: true});
    await search.fill('TB02');
    assert.equal(await page.locator('.product-card').count(), 1);
    await search.fill('nothing_matches');
    await page.getByText('Không có mặt hàng nào khớp bộ lọc.', {exact: true}).waitFor();
    await page.getByRole('button', {name: 'Xóa bộ lọc', exact: true}).click();
    await page.getByRole('combobox', {name: 'Sắp xếp sản phẩm'}).selectOption('giaBanLe:1');
    assert((await page.locator('.product-card-code').first().innerText()).startsWith('TB01'));
    await page.getByRole('button', {name: 'Xem dạng bảng', exact: true}).click();
    assert.equal(await page.locator('tbody tr').count(), 6);
    await page.getByRole('button', {name: 'Xem dạng thẻ', exact: true}).click();
    assert.equal(await page.locator('.header-cart').count(), 1);
    assert.equal(await page.locator('.sales-toolbar').getByRole('button', {name: /Giỏ hàng/}).count(), 0);
    assert(await page.getByRole('region', {name: 'Bộ lọc sản phẩm', exact: true}).isVisible());
    await openMenu();
    const dropdown = page.locator('.functions-dropdown');
    assert.equal(await dropdown.getByRole('button', {name: /Giỏ hàng/, includeHidden: true}).count(), 0);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button', {name: 'Tất cả chức năng', exact: true}).getAttribute('aria-expanded'), 'false');

    await navigate('Đặt ngưỡng');
    const row = page.locator('tbody tr').filter({has: page.getByLabel('Ngưỡng TB01', {exact: true})});
    for (const invalid of ['-1', '1.5', '2147483648', '']) {
      await row.getByRole('spinbutton').fill(invalid);
      assert(await row.getByRole('button', {name: 'Lưu', exact: true}).isDisabled());
    }
    await row.getByRole('spinbutton').fill('5');
    await row.getByRole('button', {name: 'Lưu', exact: true}).click();
    await row.getByText('Dưới ngưỡng', {exact: true}).waitFor();
    assert.deepEqual(changes, [{maHang: 'TB01', nguong: 5}]);

    await navigate('Sản phẩm');
    await page.getByRole('button', {name: '+ Thêm hàng', exact: true}).first().click();
    await page.locator('.header-cart').click();
    await page.getByRole('button', {name: '← Tiếp tục chọn hàng', exact: true}).waitFor();
    await page.getByRole('button', {name: /Tiến hành thanh toán/}).click();
    await page.getByRole('button', {name: /Quay lại sửa giỏ hàng/}).click();
    await page.getByRole('button', {name: /Tiến hành thanh toán/}).click();
    await page.getByRole('button', {name: 'Xác nhận thanh toán', exact: true}).evaluate(button => {button.click(); button.click();});
    await page.getByRole('button', {name: '← Quay lại bán hàng', exact: true}).waitFor();
    assert.equal(confirms, 1);
    assert.deepEqual(createdBodies.at(-1).items, [{maHang: 'TB01', soLuong: 1}]);
    assert.equal(orders.get(createdBodies.at(-1).id).total, 1199000);
    await page.pdf({path: 'tools/ui-redesign/after/invoice.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true});
    await navigate('Hóa đơn');
    await page.getByRole('button', {name: 'Xem hóa đơn', exact: true}).click();
    await page.locator('.invoice-paper').waitFor();

    await page.goto(baseUrl + '/admin/#view=products');
    await page.locator('.industry-product-card').first().waitFor();
    await search.fill('TB02');
    assert.equal(await page.locator('.industry-product-card').count(), 1);
    await search.fill('');
    await page.getByRole('button', {name: 'Sửa TB01', exact: true}).click();
    const edit = page.getByRole('dialog', {name: 'Sửa hàng hóa TB01', exact: true});
    assert.equal(await edit.getByLabel('Tên hàng', {exact: true}).inputValue(), products[0].name);
    await page.keyboard.press('Escape');
    await edit.waitFor({state: 'hidden'});
    await navigate('Kho chi nhánh');
    await page.locator('.wh-card').first().waitFor();
    await navigate('Công nợ');
    await page.locator('tbody tr').filter({hasText: 'CN01'}).first().waitFor();

    const views = {
      admin: ['overview','products','stock','debts','history','transfers','broadcast','monitor','reconcile'],
      branch: ['stock','cart','invoices','thresholds','offers','transfers','debt','news','history','activity','security'],
    };
    for (const width of [1440,1024,768,390]) {
      await page.setViewportSize({width, height: 1000});
      for (const [role,tabs] of Object.entries(views)) {
        for (const view of tabs) {
          await page.goto(baseUrl + '/' + role + '/#view=' + view);
          await page.locator('.subbar h1').waitFor();
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, role + '/' + view + ' ' + width + 'px overflow');
        }
        await openMenu();
        await page.keyboard.press('Escape');
      }
    }
    await page.route('**/api/products', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: 'Kết nối thử nghiệm bị gián đoạn'})}), {times: 1});
    await page.goto(baseUrl + '/admin/');
    const readError = page.getByRole('alert').filter({hasText: 'Không tải được một phần dữ liệu.'});
    await readError.waitFor();
    await page.getByRole('button', {name: 'Thử tải lại', exact: true}).click();
    await readError.waitFor({state: 'hidden'});
    await page.route('**/api/auth/me', route => route.fulfill({json: {loggedIn: false}}));
    await page.reload();
    await page.getByRole('heading', {name: 'Chào mừng trở lại!', exact: true}).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: catalog search/sort/grid/table; picture category sidebar and top filters; animated grouped menu; cart placement; valid/invalid thresholds; checkout payload/total and single confirmation; invoice/PDF; admin edit dialog; all configured views without overflow; read error/retry; login guard.');
  } finally {
    await browser.close();
    for (const res of peers) res.end();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
