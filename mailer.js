// mailer.js — sends an email notification when a new order comes in.
require('dotenv').config();
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

async function sendNewOrderEmail(order) {
  // If email isn't configured, skip silently rather than crashing the order flow.
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log('Email not configured — skipping order notification email.');
    return;
  }

  const itemsList = order.items
    .map((it) => `${it.qty} x ${it.name} - Rs. ${it.price * it.qty}`)
    .join('\n');

  const message = `
New order received!

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
    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.GMAIL_USER, // sending the alert to yourself/the restaurant
      subject: `New Order: ${order.ticket_no} - Rs. ${order.total}`,
      text: message,
    });
    console.log(`Order notification email sent for ${order.ticket_no}`);
  } catch (err) {
    console.error('Failed to send order notification email:', err.message);
  }
}

module.exports = { sendNewOrderEmail };