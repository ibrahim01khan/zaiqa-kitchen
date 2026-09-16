const fmt = (n) => `Rs. ${Number(n).toLocaleString()}`;

const STATUS_LABELS = {
  new: 'Order received',
  preparing: 'Being prepared',
  ready: 'Ready for pickup/delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

document.getElementById('trackBtn').addEventListener('click', async () => {
  const ticket = document.getElementById('trackTicket').value.trim();
  const phone = document.getElementById('trackPhone').value.trim();
  const errEl = document.getElementById('trackError');
  const resultEl = document.getElementById('trackResult');
  errEl.style.display = 'none';
  resultEl.innerHTML = '';

  if (!ticket || !phone) {
    errEl.textContent = 'Please enter both your ticket number and phone number.';
    errEl.style.display = 'block';
    return;
  }

  const btn = document.getElementById('trackBtn');
  btn.disabled = true;
  btn.textContent = 'Checking…';

  try {
    const res = await fetch(`/api/track?ticket=${encodeURIComponent(ticket)}&phone=${encodeURIComponent(phone)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not find that order.');

    const itemsHtml = data.items
      .map((it) => `<div><span>${it.qty} × ${it.name}</span><span>${fmt(it.price * it.qty)}</span></div>`)
      .join('');

    resultEl.innerHTML = `
      <div class="card" style="margin-top:16px;">
        <div class="order-ticket-no">${data.ticket_no} &middot; ${fmt(data.total)}</div>
        <div style="margin: 10px 0;">
          <span class="status-badge status-${data.status}">${STATUS_LABELS[data.status] || data.status}</span>
        </div>
        <div class="order-items">${itemsHtml}</div>
      </div>`;
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check status';
  }
});