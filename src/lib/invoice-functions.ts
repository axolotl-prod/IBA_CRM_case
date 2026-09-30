import { createServerFn } from "@tanstack/react-start";
import type { InvoiceDraftInput } from "./crm-types";

export const loadInvoices = createServerFn({ method: "POST" })
  .validator((data: { userId: string; leadId?: string }) => data)
  .handler(async ({ data }) => {
    const { readInvoicePageData } = await import("../server/database");
    return readInvoicePageData(data.userId, data.leadId || "");
  });

export const previewInvoice = createServerFn({ method: "POST" })
  .validator((data: { userId: string; invoice: InvoiceDraftInput }) => data)
  .handler(async ({ data }) => {
    const { previewInvoicePdf } = await import("../server/database");
    return previewInvoicePdf(data.userId, data.invoice);
  });

export const confirmInvoice = createServerFn({ method: "POST" })
  .validator((data: { userId: string; invoice: InvoiceDraftInput }) => data)
  .handler(async ({ data }) => {
    const { saveInvoice } = await import("../server/database");
    return { invoiceId: await saveInvoice(data.userId, data.invoice) };
  });

export const downloadInvoice = createServerFn({ method: "POST" })
  .validator((data: { userId: string; invoiceId: string }) => data)
  .handler(async ({ data }) => {
    const { readInvoicePdf } = await import("../server/database");
    return readInvoicePdf(data.userId, data.invoiceId);
  });

export const sendInvoice = createServerFn({ method: "POST" })
  .validator((data: { userId: string; invoiceId: string }) => data)
  .handler(async ({ data }) => {
    const { sendInvoiceToTelegram } = await import("../server/database");
    await sendInvoiceToTelegram(data.userId, data.invoiceId);
    return { ok: true };
  });
