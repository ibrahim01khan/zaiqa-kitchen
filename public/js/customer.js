let MENU = [];
let CART = {};

const fmt = (n) => `Rs. ${Number(n).toLocaleString()}`;

const CATEGORY_ICONS = {
  Mains: '🍛',
  Starters: '🍢',
  Rice: '🍚',
  Bread: '🫓',
  Drinks: '🥤',
  Desserts: '🍮',
};

async function loadMenu() {
  const res = await fetch('/api/menu');
  MENU = await res.json();
  renderCategoryNav();
  renderMenu();
}

function renderCategoryNav() {
  const cats = [...new Set(MENU.map((m) => m.category))];
  const nav = document.getElementById('categoryNav');
  nav.innerHTML = cats
    .map((c, i) => `<button class="category-chip ${i === 0 ? 'active' : ''}" data-cat="${c}">${CATEGORY_ICONS[c] || ''} ${c}</button>`)
    .join('');
  nav.querySelectorAll('.category-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.category-chip').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`cat-${btn.dataset.cat}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function renderMenu() {
  const container = document.getElementById('menuContainer');
  if (MENU.length === 0) {
    container.innerHTML = '<p class="empty-note">Nothing on the menu right now — check back soon.</p>';
    return;
  }
  const cats = [...new Set(MENU.map((m) => m.category))];
  container.innerHTML = cats
    .map(
      (cat, i) => `
      <div class="category-block" id="cat-${cat}" style="animation-delay:${i * 0.06}s">
        <div class="category-title"><span class="icon">${CATEGORY_ICONS[cat] || ''}</span> ${cat}</div>
        ${MENU.filter((m) => m.category === cat).map(renderMenuItem).join('')}
      </div>`
    )
    .join('');

  container.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.add);
      CART[id] = (CART[id] || 0) + 1;
      renderMenu();
      renderTicket();
    });
  });
  container.querySelectorAll('[data-inc]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.inc);
      CART[id] = (CART[id] || 0) + 1;
      renderMenu();
      renderTicket();
    });
  });
  container.querySelectorAll('[data-dec]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.dec);
      CART[id] = Math.max(0, (CART[id] || 0) - 1);
      if (CART[id] === 0) delete CART[id];
      renderMenu();
      renderTicket();
    });
  });
  updateCartCount();
}

function renderMenuItem(item) {
  const qty = CART[item.id] || 0;
  const action = qty === 0
    ? `<button class="add-btn" data-add="${item.id}">Add</button>`
    : `<div class="qty-stepper">
         <button data-dec="${item.id}">–</button>
         <span>${qty}</span>
         <button data-inc="${item.id}">+</button>
       </div>`;
  const thumb = item.image
    ? `<img class="menu-item-thumb" src="${item.image}" alt="${item.name}">`
    : `<div class="menu-item-thumb placeholder">${CATEGORY_ICONS[item.category] || '🍽️'}</div>`;
  return `
    <div class="menu-item">
      ${thumb}
      <div class="menu-item-info">
        <h3>${item.name}</h3>
        <p>${item.description || ''}</p>
      </div>
      <div class="menu-item-action">
        <span class="price">${fmt(item.price)}</span>
        ${action}
      </div>
    </div>`;
}

function updateCartCount() {
  const count = Object.values(CART).reduce((a, b) => a + b, 0);
  const countEl = document.getElementById('cartCount');
  countEl.textContent = count;
  countEl.classList.remove('bump');
  void countEl.offsetWidth;
  countEl.classList.add('bump');
}

function renderTicket() {
  const body = document.getElementById('ticketBody');
  const footer = document.getElementById('ticketFooter');
  const entries = Object.entries(CART);
  if (entries.length === 0) {
    body.innerHTML = '<p class="empty-note">Nothing on the ticket yet — add something from the menu.</p>';
    footer.style.display = 'none';
    return;
  }
  let total = 0;
  body.innerHTML = entries
    .map(([id, qty]) => {
      const item = MENU.find((m) => m.id === Number(id));
      if (!item) return '';
      total += item.price * qty;
      return `<div class="ticket-line">
        <span>${qty} × ${item.name}</span>
        <span>${fmt(item.price * qty)} <span class="remove" data-remove="${id}">remove</span></span>
      </div>`;
    })
    .join('');
  body.querySelectorAll('[data-remove]').forEach((el) => {
    el.addEventListener('click', () => {
      delete CART[el.dataset.remove];
      renderMenu();
      renderTicket();
    });
  });
  document.getElementById('ticketTotal').textContent = fmt(total);
  footer.style.display = 'block';
}

function openDrawer() {
  document.getElementById('overlay').classList.add('open');
  document.getElementById('ticketDrawer').classList.add('open');
}
function closeDrawer() {
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('ticketDrawer').classList.remove('open');
}

async function placeOrder() {
  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const address = document.getElementById('custAddress').value.trim();
  const note = document.getElementById('custNote').value.trim();
  const paymentMethodEl = document.querySelector('input[name="paymentMethod"]:checked');
  const paymentMethod = paymentMethodEl ? paymentMethodEl.value : 'cod';
  const errEl = document.getElementById('orderError');
  errEl.style.display = 'none';

  if (!name || !phone || !address) {
    errEl.textContent = 'Please add your name, phone number, and delivery address.';
    errEl.style.display = 'block';
    return;
  }
  const items = Object.entries(CART).map(([id, qty]) => ({ id: Number(id), qty }));
  if (items.length === 0) {
    errEl.textContent = 'Add at least one item before placing the order.';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('placeOrderBtn');
  btn.disabled = true;
  btn.textContent = 'Placing order…';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_name: name, customer_phone: phone, address, note, payment_method: paymentMethod, items }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong.');

    document.getElementById('ticketBody').innerHTML = `
      <div class="confirm-screen">
        <div class="stamp">Order Placed</div>
        <div class="ticket-no">${data.ticket_no}</div>
        <p>Show this ticket number when you pick up, or keep it for delivery tracking. Total: ${fmt(data.total)}. Payment: Cash on Delivery.</p>
      </div>`;
    document.getElementById('ticketFooter').style.display = 'none';
    CART = {};
    renderMenu();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Place order';
  }
}

document.getElementById('openCartBtn').addEventListener('click', openDrawer);
document.getElementById('closeDrawerBtn').addEventListener('click', closeDrawer);
document.getElementById('overlay').addEventListener('click', closeDrawer);
document.getElementById('placeOrderBtn').addEventListener('click', placeOrder);

loadMenu();