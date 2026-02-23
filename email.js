import nodemailer from 'nodemailer';

const ADMIN_ORDER_EMAIL = process.env.ADMIN_ORDER_EMAIL || 'biomedinnovationpharmaceutical@gmail.com';

let transporter = null;
let fromEmail = 'noreply@biomed.com';
function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.warn('Email: SMTP not configured (SMTP_USER/SMTP_PASS or GMAIL_USER/GMAIL_APP_PASSWORD). Order emails skipped.');
    return null;
  }
  fromEmail = user;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return transporter;
}

function formatAmount(amountPaise, currency = 'pkr') {
  if (currency === 'pkr' || !currency) return `Rs. ${(Number(amountPaise) / 100).toLocaleString()}`;
  return `${(Number(amountPaise) / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

function orderDetailsHtml(order) {
  const items = order.items || [];
  const total = formatAmount(order.amount_total, order.currency);
  const rows = items.map(
    (i) => `<tr><td>${escapeHtml(i.name)}</td><td>${i.quantity}</td><td>Rs. ${Number(i.price || 0).toLocaleString()}</td><td>Rs. ${(i.quantity * (i.price || 0)).toLocaleString()}</td></tr>`
  ).join('');
  return `
    <p><strong>Order ID:</strong> ${escapeHtml(order.stripe_session_id || order.id || '')}</p>
    <p><strong>Status:</strong> ${escapeHtml(order.status || '')}</p>
    <p><strong>Customer:</strong> ${escapeHtml(order.customer_name || '')}</p>
    <p><strong>Email:</strong> ${escapeHtml(order.customer_email || '')}</p>
    <p><strong>Phone:</strong> ${escapeHtml(order.customer_phone || '')}</p>
    <p><strong>Address:</strong> ${escapeHtml(order.customer_address || '')} ${order.customer_city ? escapeHtml(order.customer_city) : ''} ${order.customer_postal_code ? escapeHtml(order.customer_postal_code) : ''}</p>
    ${order.delivery_notes ? `<p><strong>Delivery notes:</strong> ${escapeHtml(order.delivery_notes)}</p>` : ''}
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; margin: 12px 0;">
      <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p><strong>Total: ${total}</strong></p>
  `;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Send order confirmation to customer and order details to admin. Fire-and-forget; errors are logged only. */
export async function sendOrderEmails(order) {
  const trans = getTransporter();
  if (!trans) return;

  const customerEmail = order.customer_email;
  if (!customerEmail) {
    console.warn('Email: No customer email on order, skipping customer email.');
  }

  const orderHtml = orderDetailsHtml(order);
  const subjectBase = `Order ${order.stripe_session_id || order.id || ''} – BioMed`;

  try {
    const toAdmin = {
      from: fromEmail,
      to: ADMIN_ORDER_EMAIL,
      subject: `[Admin] New order – ${order.customer_name || 'Customer'}`,
      html: `<h2>New order received</h2>${orderHtml}`,
      text: `New order from ${order.customer_name} (${order.customer_email}). Total: ${formatAmount(order.amount_total, order.currency)}. Check admin dashboard for full details.`,
    };
    await trans.sendMail(toAdmin);
  } catch (err) {
    console.error('Email (to admin) failed:', err.message);
  }

  if (customerEmail) {
    try {
      const toCustomer = {
        from: fromEmail,
        to: customerEmail,
        subject: `Your order is confirmed – BioMed`,
        html: `<h2>Order confirmed</h2><p>Hi ${escapeHtml(order.customer_name || 'Customer')},</p><p>Thank you for your order. Here are the details:</p>${orderHtml}<p>We will process your order shortly.</p><p>— BioMed Innovation Pharmaceuticals</p>`,
        text: `Order confirmed. Total: ${formatAmount(order.amount_total, order.currency)}. We will process your order shortly. – BioMed`,
      };
      await trans.sendMail(toCustomer);
    } catch (err) {
      console.error('Email (to customer) failed:', err.message);
    }
  }
}
