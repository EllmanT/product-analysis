/** All email templates use inline styles only — email clients strip external CSS. */

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function baseEmailTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:#1E3A5F;padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="color:#ffffff;font-size:24px;font-weight:700;letter-spacing:1px;">STOCKFLOW</td>
                <td align="right" style="color:#93C5FD;font-size:12px;">B2B Trade Platform</td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Content -->
        <tr><td style="padding:32px;">${content}</td></tr>
        <!-- Footer -->
        <tr>
          <td style="background:#F1F5F9;padding:20px 32px;text-align:center;">
            <p style="margin:0;color:#6B7280;font-size:12px;">© StockFlow · You're receiving this because you have an account with us</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function quotationEmailTemplate(data: {
  customerFirstName: string;
  quotationId: string;
  referenceId: string;
  items: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  total: number;
  siteUrl: string;
}): string {
  const itemRows = data.items
    .map(
      (item, i) => `
      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#F8FAFC"};">
        <td style="padding:10px 12px;font-size:14px;color:#111827;border-bottom:1px solid #E5E7EB;">${item.name}</td>
        <td style="padding:10px 12px;font-size:14px;color:#374151;border-bottom:1px solid #E5E7EB;text-align:center;">${item.quantity}</td>
        <td style="padding:10px 12px;font-size:14px;color:#374151;border-bottom:1px solid #E5E7EB;text-align:right;">${fmt(item.unitPrice)}</td>
        <td style="padding:10px 12px;font-size:14px;font-weight:600;color:#111827;border-bottom:1px solid #E5E7EB;text-align:right;">${fmt(item.lineTotal)}</td>
      </tr>`
    )
    .join("");

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1E3A5F;">Thank you for your order, ${data.customerFirstName}!</h2>
    <p style="margin:0 0 24px;color:#6B7280;font-size:15px;">We've received your quotation and will review it shortly. You'll receive a follow-up email once it's confirmed.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
      <thead>
        <tr style="background:#1E40AF;">
          <th style="padding:10px 12px;font-size:13px;color:#ffffff;text-align:left;font-weight:600;">Product</th>
          <th style="padding:10px 12px;font-size:13px;color:#ffffff;text-align:center;font-weight:600;">Qty</th>
          <th style="padding:10px 12px;font-size:13px;color:#ffffff;text-align:right;font-weight:600;">Unit Price</th>
          <th style="padding:10px 12px;font-size:13px;color:#ffffff;text-align:right;font-weight:600;">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div style="text-align:right;margin-bottom:24px;">
      <table cellpadding="0" cellspacing="0" style="margin-left:auto;">
        <tr>
          <td style="padding:6px 12px;font-size:14px;color:#6B7280;">Subtotal</td>
          <td style="padding:6px 12px;font-size:14px;color:#111827;font-weight:600;text-align:right;">${fmt(data.subtotal)}</td>
        </tr>
        <tr style="border-top:2px solid #E5E7EB;">
          <td style="padding:8px 12px;font-size:16px;font-weight:700;color:#1E40AF;">Total</td>
          <td style="padding:8px 12px;font-size:18px;font-weight:700;color:#1E40AF;text-align:right;">${fmt(data.total)}</td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;margin:24px 0;">
      <a href="${data.siteUrl}/dashboard/quotations/${data.quotationId}" style="display:inline-block;background:#2563EB;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;">View &amp; Manage Your Quotation</a>
    </div>

    <p style="margin:0;font-size:13px;color:#6B7280;text-align:center;">You can log in to your StockFlow account to track this order and pay once confirmed.</p>
  `;

  return baseEmailTemplate(content);
}

export function invoiceEmailTemplate(data: {
  customerFirstName: string;
  invoiceId: string;
  invoiceNumber: string;
  items: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }>;
  subtotal: number;
  total: number;
  siteUrl: string;
}): string {
  const itemRows = data.items
    .map(
      (item, i) => `
      <tr style="background:${i % 2 === 0 ? "#ffffff" : "#F8FAFC"};">
        <td style="padding:10px 12px;font-size:14px;color:#111827;border-bottom:1px solid #E5E7EB;">${item.name}</td>
        <td style="padding:10px 12px;font-size:14px;color:#374151;border-bottom:1px solid #E5E7EB;text-align:center;">${item.quantity}</td>
        <td style="padding:10px 12px;font-size:14px;color:#374151;border-bottom:1px solid #E5E7EB;text-align:right;">${fmt(item.unitPrice)}</td>
        <td style="padding:10px 12px;font-size:14px;font-weight:600;color:#111827;border-bottom:1px solid #E5E7EB;text-align:right;">${fmt(item.lineTotal)}</td>
      </tr>`
    )
    .join("");

  const headerOverride = `<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#064E3B;padding:24px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="color:#ffffff;font-size:24px;font-weight:700;letter-spacing:1px;">STOCKFLOW</td>
                <td align="right" style="color:#6EE7B7;font-size:12px;">B2B Trade Platform</td>
              </tr>
            </table>
          </td>
        </tr>`;

  const content = `
    <div style="background:#D1FAE5;color:#065F46;padding:12px 16px;border-radius:6px;margin-bottom:24px;font-weight:600;font-size:14px;">✓ Payment Confirmed</div>

    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1E3A5F;">Your Invoice is Ready, ${data.customerFirstName}!</h2>
    <p style="margin:0 0 24px;color:#6B7280;font-size:15px;">Your payment has been received. This invoice is your official proof of purchase.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:20px;">
      <thead>
        <tr style="background:#1E40AF;">
          <th style="padding:10px 12px;font-size:13px;color:#ffffff;text-align:left;font-weight:600;">Product</th>
          <th style="padding:10px 12px;font-size:13px;color:#ffffff;text-align:center;font-weight:600;">Qty</th>
          <th style="padding:10px 12px;font-size:13px;color:#ffffff;text-align:right;font-weight:600;">Unit Price</th>
          <th style="padding:10px 12px;font-size:13px;color:#ffffff;text-align:right;font-weight:600;">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div style="text-align:right;margin-bottom:24px;">
      <table cellpadding="0" cellspacing="0" style="margin-left:auto;">
        <tr>
          <td style="padding:6px 12px;font-size:14px;color:#6B7280;">Subtotal</td>
          <td style="padding:6px 12px;font-size:14px;color:#111827;font-weight:600;text-align:right;">${fmt(data.subtotal)}</td>
        </tr>
        <tr style="border-top:2px solid #E5E7EB;">
          <td style="padding:8px 12px;font-size:16px;font-weight:700;color:#065F46;">Total</td>
          <td style="padding:8px 12px;font-size:18px;font-weight:700;color:#065F46;text-align:right;">${fmt(data.total)}</td>
        </tr>
      </table>
    </div>

    <div style="text-align:center;margin:24px 0;">
      <a href="${data.siteUrl}/dashboard/invoices/${data.invoiceId}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;">Download Your Invoice</a>
    </div>

    <p style="margin:0;font-size:13px;color:#6B7280;text-align:center;">Keep this invoice for your records.</p>
  `;

  // Build a standalone template with green header
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:Arial,sans-serif;">
  ${headerOverride}
        <tr><td style="padding:32px;">${content}</td></tr>
        <tr>
          <td style="background:#F1F5F9;padding:20px 32px;text-align:center;">
            <p style="margin:0;color:#6B7280;font-size:12px;">© StockFlow · You're receiving this because you have an account with us</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function adminQuotationNotificationTemplate(data: {
  customerName: string;
  tradeName: string;
  customerEmail: string;
  quotationId: string;
  referenceId: string;
  itemCount: number;
  total: number;
  siteUrl: string;
}): string {
  const content = `
    <h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#1E3A5F;">New Quotation Received</h2>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 0;font-size:14px;color:#6B7280;width:40%;">Customer Name</td>
        <td style="padding:10px 0;font-size:14px;color:#111827;font-weight:600;">${data.customerName}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 0;font-size:14px;color:#6B7280;">Trade Name</td>
        <td style="padding:10px 0;font-size:14px;color:#111827;font-weight:600;">${data.tradeName}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 0;font-size:14px;color:#6B7280;">Email</td>
        <td style="padding:10px 0;font-size:14px;color:#111827;font-weight:600;">${data.customerEmail}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 0;font-size:14px;color:#6B7280;">Reference</td>
        <td style="padding:10px 0;font-size:14px;color:#111827;font-weight:600;">#${data.referenceId}</td>
      </tr>
      <tr style="border-bottom:1px solid #E5E7EB;">
        <td style="padding:10px 0;font-size:14px;color:#6B7280;">Items</td>
        <td style="padding:10px 0;font-size:14px;color:#111827;font-weight:600;">${data.itemCount} item${data.itemCount !== 1 ? "s" : ""}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;font-size:14px;color:#6B7280;">Total</td>
        <td style="padding:10px 0;font-size:16px;color:#1E40AF;font-weight:700;">${fmt(data.total)}</td>
      </tr>
    </table>

    <div style="text-align:center;">
      <a href="${data.siteUrl}/admin/quotations/${data.quotationId}" style="display:inline-block;background:#1E40AF;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;">View in Admin Panel</a>
    </div>
  `;

  return baseEmailTemplate(content);
}
