// mailer.js — sends an email notification when a new order comes in.
// Uses Resend (HTTP-based email API) instead of Gmail SMTP, because
// SMTP connections are often blocked on cloud hosts like Railway.
require('dotenv').config();
const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendNewOrderEmail(order) {
  if (!resend || !process.env.NOTIFY_EMAIL) {
    console.log('Email not configured — skipping order notification email.');
    return;
  }

  const itemsList = order.items
    .map((it) => `${it.qty} x ${it.name} - Rs. ${it.price * it.qty}`)
    .join('\n');

  const message = `New order received!

Ticket: ${order.ticket_no}
Customer: ${order.customer_name}
Phone: ${order.customer_phone}
Address: ${order.address}
Payment: ${(order.payment_method || 'cod').toUpperCase()}
Note: ${order.note || '(none)'}

Items:
${itemsList}

Total: Rs. ${order.total}
`;

  try {
    await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: process.env.NOTIFY_EMAIL,
      subject: `New Order: ${order.ticket_no} - Rs. ${order.total}`,
      text: message,
    });
    console.log(`Order notification email sent for ${order.ticket_no}`);
  } catch (err) {
    console.error('Failed to send order notification email:', err.message);
  }
}

module.exports = { sendNewOrderEmail };