// A plain link to the printable invoice, opened in a new tab: window.open() with
// window features was refused wherever pop-ups are blocked (in-app browsers),
// leaving the customer with "Pop-up blocked" and no invoice.
const InvoiceDownloadButton = ({ orderId }: { orderId: string }) => (
  <div className="flex flex-col items-end gap-1">
    <a
      href={`/api/orders/${encodeURIComponent(orderId)}/invoice`}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center justify-center rounded-md border border-ui-border-base bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ui-bg-subtle"
    >
      Tax invoice
    </a>
  </div>
)

export default InvoiceDownloadButton
