// server.js — the whole backend. Deliberately built on Node's built-in
// `http` module only, so there is nothing to `npm install`: just run
// `node server.js`.
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const db = require('./db');
const { verifyPassword } = require('./auth-utils');
const { sendNewOrderEmail } = require('./mailer');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

// ---------- Sessions (in-memory; resets on restart, which is fine for a demo) ----------
const sessions = new Map(); // sid -> { adminId, expires }

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return out;
}

function getSession(req) {
  const sid = parseCookies(req).sid;
  if (!sid) return null;
  const session = sessions.get(sid);
  if (!session) return null;
  if (session.expires < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  return session;
}

function createSession(res, adminId) {
  const sid = crypto.randomUUID();
  sessions.set(sid, { adminId, expires: Date.now() + SESSION_MAX_AGE_MS });
  res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE_MS / 1000}`);
  return sid;
}

function destroySession(req, res) {
  const sid = parseCookies(req).sid;
  if (sid) sessions.delete(sid);
  res.setHeader('Set-Cookie', 'sid=; HttpOnly; Path=/; Max-Age=0');
}

// ---------- Small helpers ----------
function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', (c) => (chunks += c));
    req.on('end', () => {
      if (!chunks) return resolve({});
      try {
        resolve(JSON.parse(chunks));
      } catch (e) {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function generateTicketNo() {
  return `T-${Math.floor(1000 + Math.random() * 9000)}`;
}

function requireAdmin(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Admin login required.' });
    return null;
  }
  return session;
}

// ---------- Route handlers ----------
async function handleLogin(req, res) {
  const body = await readBody(req);
  const { username, password } = body;
  if (!username || !password) return sendJson(res, 400, { error: 'Username and password are required.' });

  const data = db.load();
  const admin = data.admins.find((a) => a.username === username);
  if (!admin || !verifyPassword(password, admin.passwordHash)) {
    return sendJson(res, 401, { error: 'Incorrect username or password.' });
  }
  createSession(res, admin.id);
  sendJson(res, 200, { ok: true, username: admin.username });
}

function handleLogout(req, res) {
  destroySession(req, res);
  sendJson(res, 200, { ok: true });
}

function handleMe(req, res) {
  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: 'Not logged in.' });
  sendJson(res, 200, { ok: true });
}

function handleGetMenu(req, res) {
  const data = db.load();
  const items = data.menuItems
    .filter((m) => m.available)
    .sort((a, b) => a.category.localeCompare(b.category) || a.sort_order - b.sort_order);
  sendJson(res, 200, items);
}

function handleGetMenuAll(req, res) {
  if (!requireAdmin(req, res)) return;
  const data = db.load();
  const items = [...data.menuItems].sort((a, b) => a.category.localeCompare(b.category) || a.sort_order - b.sort_order);
  sendJson(res, 200, items);
}

async function handleCreateMenuItem(req, res) {
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);
  const { name, description, price, category, available, image } = body;
  if (!name || price == null || !category) {
    return sendJson(res, 400, { error: 'Name, price, and category are required.' });
  }
  const data = db.load();
  const item = {
    id: db.nextId(data, 'menuItem'),
    name,
    description: description || '',
    price: Number(price),
    category,
    image: image || '',
    available: available !== false,
    sort_order: data.menuItems.length,
  };
  data.menuItems.push(item);
  db.save(data);
  sendJson(res, 201, item);
}

async function handleUpdateMenuItem(req, res, id) {
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);
  const data = db.load();
  const item = data.menuItems.find((m) => m.id === id);
  if (!item) return sendJson(res, 404, { error: 'Menu item not found.' });

  if (body.name != null) item.name = body.name;
  if (body.description != null) item.description = body.description;
  if (body.price != null) item.price = Number(body.price);
  if (body.category != null) item.category = body.category;
  if (body.available != null) item.available = !!body.available;
  if (body.image != null) item.image = body.image;
  db.save(data);
  sendJson(res, 200, item);
}

function handleDeleteMenuItem(req, res, id) {
  if (!requireAdmin(req, res)) return;
  const data = db.load();
  const idx = data.menuItems.findIndex((m) => m.id === id);
  if (idx === -1) return sendJson(res, 404, { error: 'Menu item not found.' });
  data.menuItems.splice(idx, 1);
  db.save(data);
  sendJson(res, 200, { ok: true });
}

async function handleCreateOrder(req, res) {
  const body = await readBody(req);
  const { customer_name, customer_phone, address, note, items, payment_method } = body;
  if (!customer_name || !customer_phone || !address || !Array.isArray(items) || items.length === 0) {
    return sendJson(res, 400, { error: 'Name, phone, address, and at least one item are required.' });
  }

  const allowedPayments = ['cod', 'jazzcash', 'easypaisa'];
  const paymentMethod = allowedPayments.includes(payment_method) ? payment_method : 'cod';

  const data = db.load();
  let total = 0;
  const lineItems = [];
  for (const line of items) {
    const menuItem = data.menuItems.find((m) => m.id === Number(line.id) && m.available);
    if (!menuItem) continue;
    const qty = Math.max(1, Number(line.qty) || 1);
    total += menuItem.price * qty;
    lineItems.push({ menu_item_id: menuItem.id, name: menuItem.name, price: menuItem.price, qty });
  }
  if (lineItems.length === 0) {
    return sendJson(res, 400, { error: 'None of the items in this order are currently available.' });
  }

  const order = {
    id: db.nextId(data, 'order'),
    ticket_no: generateTicketNo(),
    customer_name,
    customer_phone,
    address,
    note: note || '',
    payment_method: paymentMethod,
    status: 'new',
    total,
    created_at: new Date().toISOString(),
    items: lineItems,
  };
  data.orders.push(order);
  db.save(data);
  sendJson(res, 201, { ok: true, order_id: order.id, ticket_no: order.ticket_no, total: order.total });

  // Fire the email after responding, so a slow/failed email never delays the order confirmation.
  sendNewOrderEmail(order);
}

function handleGetOrders(req, res) {
  if (!requireAdmin(req, res)) return;
  const data = db.load();
  const orders = [...data.orders].sort((a, b) => b.id - a.id);
  sendJson(res, 200, orders);
}

async function handleUpdateOrderStatus(req, res, id) {
  if (!requireAdmin(req, res)) return;
  const body = await readBody(req);
  const allowed = ['new', 'preparing', 'ready', 'completed', 'cancelled'];
  if (!allowed.includes(body.status)) {
    return sendJson(res, 400, { error: `Status must be one of: ${allowed.join(', ')}` });
  }
  const data = db.load();
  const order = data.orders.find((o) => o.id === id);
  if (!order) return sendJson(res, 404, { error: 'Order not found.' });
  order.status = body.status;
  db.save(data);
  sendJson(res, 200, { ok: true });
}

// Public order tracking — requires BOTH ticket number and phone to match,
// so a stranger can't look up someone else's order by guessing a ticket number.
function handleTrackOrder(req, res, query) {
  const ticket = (query.ticket || '').trim().toUpperCase();
  const phone = (query.phone || '').trim();
  if (!ticket || !phone) {
    return sendJson(res, 400, { error: 'Ticket number and phone are required.' });
  }
  const data = db.load();
  const order = data.orders.find(
    (o) => o.ticket_no.toUpperCase() === ticket && o.customer_phone.replace(/\D/g, '') === phone.replace(/\D/g, '')
  );
  if (!order) {
    return sendJson(res, 404, { error: 'No order found with that ticket number and phone.' });
  }
  sendJson(res, 200, {
    ticket_no: order.ticket_no,
    status: order.status,
    total: order.total,
    items: order.items,
    created_at: order.created_at,
  });
}

// ---------- Static file serving ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// ---------- Router ----------
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  try {
    if (pathname === '/api/auth/login' && method === 'POST') return await handleLogin(req, res);
    if (pathname === '/api/auth/logout' && method === 'POST') return handleLogout(req, res);
    if (pathname === '/api/auth/me' && method === 'GET') return handleMe(req, res);

    if (pathname === '/api/menu' && method === 'GET') return handleGetMenu(req, res);
    if (pathname === '/api/menu/all' && method === 'GET') return handleGetMenuAll(req, res);
    if (pathname === '/api/menu' && method === 'POST') return await handleCreateMenuItem(req, res);

    let match = pathname.match(/^\/api\/menu\/(\d+)$/);
    if (match && method === 'PUT') return await handleUpdateMenuItem(req, res, Number(match[1]));
    if (match && method === 'DELETE') return handleDeleteMenuItem(req, res, Number(match[1]));

    if (pathname === '/api/orders' && method === 'POST') return await handleCreateOrder(req, res);
    if (pathname === '/api/orders' && method === 'GET') return handleGetOrders(req, res);

    match = pathname.match(/^\/api\/orders\/(\d+)\/status$/);
    if (match && method === 'PATCH') return await handleUpdateOrderStatus(req, res, Number(match[1]));

    if (pathname === '/api/track' && method === 'GET') return handleTrackOrder(req, res, parsed.query);

    if (pathname.startsWith('/api/')) {
      return sendJson(res, 404, { error: 'Unknown API route.' });
    }

    return serveStatic(req, res, pathname);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'Server error. Please try again.' });
  }
});

server.listen(PORT, () => {
  console.log(`Resto-order running at http://localhost:${PORT}`);
  console.log(`Admin dashboard at   http://localhost:${PORT}/admin.html`);
});