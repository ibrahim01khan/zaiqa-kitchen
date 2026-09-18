const fmt = (n) => `Rs. ${Number(n).toLocaleString()}`;
let MENU_ITEMS = [];

async function checkSession() {
  const res = await fetch('/api/auth/me');
  if (res.ok) {
    showDashboard();
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('loginView').style.display = 'block';
  document.getElementById('dashboardView').style.display = 'none';
}

function showDashboard() {
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('dashboardView').style.display = 'block';
  loadOrders();
  loadMenuAdmin();
}

document.getElementById('loginBtn').addEventListener('click', async () => {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed.');
    showDashboard();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  showLogin();
});

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('ordersTab').style.display = btn.dataset.tab === 'orders' ? 'block' : 'none';
    document.getElementById('menuTab').style.display = btn.dataset.tab === 'menu' ? 'block' : 'none';
  });
});

async function loadOrders() {
  const res = await fetch('/api/orders');
  if (!res.ok) return;
  const orders = await res.json();
  const list = document.getElementById('ordersList');
  if (orders.length === 0) {
    list.innerHTML = '<p class="empty-note">No orders yet — they will show up here as customers check out.</p>';
    return;
  }
  list.innerHTML = orders.map(renderOrderCard).join('');
  list.querySelectorAll('[data-status-for]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      await fetch(`/api/orders/${sel.dataset.statusFor}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: sel.value }),
      });
      loadOrders();
    });
  });
}

function renderOrderCard(order) {
  const itemsHtml = order.items
    .map((it) => `<div><span>${it.qty} × ${it.name}</span><span>${fmt(it.price * it.qty)}</span></div>`)
    .join('');
  const statuses = ['new', 'preparing', 'ready', 'completed', 'cancelled'];
  const options = statuses
    .map((s) => `<option value="${s}" ${s === order.status ? 'selected' : ''}>${s}</option>`)
    .join('');
  return `
    <div class="card order-card">
      <div style="flex:1;">
        <div class="order-ticket-no">${order.ticket_no} &middot; ${fmt(order.total)}</div>
        <div class="order-meta">${order.customer_name} — ${order.customer_phone} &middot; ${order.address || ''} &middot; ${(order.payment_method || 'cod').toUpperCase()}${order.note ? ` &middot; "${order.note}"` : ''} &middot; ${order.created_at}</div>
        <div class="order-items">${itemsHtml}</div>
        <span class="status-badge status-${order.status}">${order.status}</span>
      </div>
      <select class="status-select" data-status-for="${order.id}">${options}</select>
    </div>`;
}

async function loadMenuAdmin() {
  const res = await fetch('/api/menu/all');
  if (!res.ok) return;
  MENU_ITEMS = await res.json();
  renderMenuAdmin();
}

function renderMenuAdmin() {
  const rows = document.getElementById('menuRows');
  rows.innerHTML = MENU_ITEMS.map(
    (item) => `
    <div class="menu-admin-row" data-row="${item.id}">
      <input value="${item.name}" data-field="name">
      <input value="${item.description || ''}" data-field="description">
      <input value="${item.price}" type="number" data-field="price">
      <input value="${item.category}" data-field="category">
      <input value="${item.image || ''}" placeholder="https://..." data-field="image">
      <input type="checkbox" ${item.available ? 'checked' : ''} data-field="available">
      <div>
        <button class="icon-btn" data-save="${item.id}" title="Save">Save</button>
        <button class="icon-btn" data-delete="${item.id}" title="Delete">Delete</button>
      </div>
    </div>`
  ).join('');

  rows.querySelectorAll('[data-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = rows.querySelector(`[data-row="${btn.dataset.save}"]`);
      const payload = {
        name: row.querySelector('[data-field="name"]').value,
        description: row.querySelector('[data-field="description"]').value,
        price: Number(row.querySelector('[data-field="price"]').value),
        category: row.querySelector('[data-field="category"]').value,
        image: row.querySelector('[data-field="image"]').value,
        available: row.querySelector('[data-field="available"]').checked,
      };
      await fetch(`/api/menu/${btn.dataset.save}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      loadMenuAdmin();
    });
  });
  rows.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this menu item?')) return;
      await fetch(`/api/menu/${btn.dataset.delete}`, { method: 'DELETE' });
      loadMenuAdmin();
    });
  });
}

document.getElementById('addItemBtn').addEventListener('click', async () => {
  await fetch('/api/menu', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'New item', description: '', price: 0, category: 'Mains', available: true }),
  });
  loadMenuAdmin();
});

checkSession();