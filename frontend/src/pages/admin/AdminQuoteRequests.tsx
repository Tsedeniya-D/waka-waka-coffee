import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useDebounce } from "../../hooks";
import { downloadCsv } from "../../lib/api";
import {
  useDirectory,
  useQuoteActions,
  useQuoteRequest,
  useQuoteRequests,
} from "../../queries/admin";
import {
  ErrorState,
  LoadingState,
  Pagination,
  StatusActions,
  StatusBadge,
  formatDateTime,
  formatKg,
  formatMoney,
  prettyStatus,
  useConfirm,
  useFlash,
} from "../../components/admin/ui";
import DocumentsPanel from "../../components/admin/DocumentsPanel";
import type { QuoteItem, QuoteRequest, QuoteRequestDetail, QuoteStatus } from "../../types";

const statusOptions: QuoteStatus[] = [
  "new",
  "reviewing",
  "contacted",
  "quoted",
  "accepted",
  "rejected",
  "converted",
];

const CURRENCIES = ["USD", "EUR", "GBP", "ETB", "JPY", "CNY", "AED", "SAR"];
const INCOTERMS = ["FOB", "FCA", "CFR", "CIF", "CPT", "CIP", "EXW", "DAP", "DDP"];
const PAGE_SIZE = 100;

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black disabled:bg-gray-100 disabled:text-gray-500";

type ConfirmFn = ReturnType<typeof useConfirm>["confirm"];

/** Ask for a reason when rejecting; returns false when the user backs out. */
async function askStatusReason(confirm: ConfirmFn, next: QuoteStatus): Promise<string | undefined | false> {
  if (next !== "rejected") return undefined;
  const result = await confirm({
    title: "Reject this quote request?",
    message: "The reason is appended to the admin notes.",
    confirmLabel: "Reject",
    danger: true,
    withReason: true,
    reasonLabel: "Reason (optional)",
  });
  if (result === false) return false;
  return typeof result === "string" && result ? result : undefined;
}

export default function AdminQuoteRequests() {
  const navigate = useNavigate();
  const { can, isAdmin } = useAuth();
  const canUpdate = can("quote_requests", "update");
  const canConvert = canUpdate && can("orders", "create");
  const canDelete = isAdmin && can("quote_requests", "delete");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [convertedOrder, setConvertedOrder] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, { delay: 350 });

  const listQuery = useQuoteRequests({
    search: debouncedSearch.trim() || undefined,
    status: statusFilter || undefined,
    page,
    limit: PAGE_SIZE,
  });
  const requests = listQuery.data?.data ?? [];
  const total = listQuery.data?.meta.total ?? 0;
  const filtersActive = Boolean(debouncedSearch.trim() || statusFilter);

  const actions = useQuoteActions();
  const flash = useFlash();
  const { confirm, dialog } = useConfirm();

  const resetPage = () => {
    setPage(1);
    setSelectedIds([]);
  };

  async function convertToOrder(request: QuoteRequest) {
    const ok = await confirm({
      title: `Convert ${request.reference_number} to a sales order?`,
      message:
        "A draft sales order is created from the quote and its priced items. The quote becomes read-only.",
      confirmLabel: "Convert",
    });
    if (!ok) return;
    setBusyId(request.id);
    setConvertedOrder(null);
    try {
      const order = await actions.convert.mutateAsync(request.id);
      setConvertedOrder(order.order_number);
      flash.clear();
    } catch (err) {
      flash.error(err);
    } finally {
      setBusyId(null);
    }
  }

  async function updateStatus(request: QuoteRequest, next: string) {
    const status = next as QuoteStatus;
    const reason = await askStatusReason(confirm, status);
    if (reason === false) return;
    setBusyId(request.id);
    try {
      await actions.setStatus.mutateAsync({ id: request.id, status, reason });
      flash.success(`${request.reference_number} moved to ${prettyStatus(status)}.`);
    } catch (err) {
      flash.error(err);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRequest(request: QuoteRequest) {
    const ok = await confirm({
      title: "Delete quote request?",
      message: `${request.reference_number} (${request.company}) will be permanently deleted. Quotes that already have a sales order cannot be deleted.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    setBusyId(request.id);
    try {
      await actions.remove.mutateAsync(request.id);
      flash.success("Quote request deleted successfully.");
      setSelectedIds((prev) => prev.filter((id) => id !== request.id));
      if (selectedId === request.id) setSelectedId(null);
    } catch (err) {
      flash.error(err);
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (requests.length > 0 && selectedIds.length === requests.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(requests.map((request) => request.id));
    }
  }

  async function bulkDelete() {
    if (selectedIds.length === 0) return;
    const ok = await confirm({
      title: `Delete ${selectedIds.length} selected quote request(s)?`,
      message: "Quotes that already have a sales order are skipped.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await actions.bulkRemove.mutateAsync(selectedIds);
      const skippedRefs = result.skipped.map(
        (id) => requests.find((r) => r.id === id)?.reference_number ?? id
      );
      const parts = [`${result.deleted.length} quote request(s) deleted.`];
      if (skippedRefs.length) {
        parts.push(`Skipped ${skippedRefs.length} with sales orders: ${skippedRefs.join(", ")}.`);
      }
      flash.success(parts.join(" "));
      setSelectedIds(result.skipped);
    } catch (err) {
      flash.error(err);
    }
  }

  function downloadCSV() {
    if (requests.length === 0) return;
    downloadCsv(
      "quote-requests.csv",
      [
        "Reference Number",
        "Full Name",
        "Company",
        "Email",
        "Phone",
        "Country",
        "Destination Port",
        "Product",
        "Region",
        "Grade",
        "Processing",
        "Quantity KG",
        "Packaging",
        "Certifications",
        "Target Shipment",
        "Status",
        "Customer Code",
        "Assigned To",
        "Orders",
        "Message",
        "Admin Notes",
        "Created At",
      ],
      requests.map((request) => [
        request.reference_number,
        request.full_name,
        request.company,
        request.email,
        request.phone,
        request.country,
        request.destination_port,
        request.product_name,
        request.region_name,
        request.grade,
        request.processing,
        request.quantity_kg,
        request.packaging,
        request.certifications?.join("; "),
        request.target_shipment,
        request.status,
        request.customer?.customer_code,
        request.assigned?.full_name,
        request.orders?.map((o) => o.order_number).join("; "),
        request.message,
        request.admin_notes,
        request.created_at,
      ])
    );
  }

  return (
    <div className="space-y-6">
      {dialog}
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Quote Requests
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Manage quotation requests submitted from the Waka Coffee website.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={downloadCSV}
            disabled={requests.length === 0}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Download CSV
          </button>
        </div>
      </div>

      {/* Messages */}
      {flash.banner}

      {convertedOrder && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <span>
            Quote request converted to draft Sales Order <strong>{convertedOrder}</strong>.
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate("/admin/orders")}
              className="rounded-lg border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
            >
              Open Sales Orders →
            </button>
            <button
              type="button"
              onClick={() => setConvertedOrder(null)}
              className="text-xs font-medium opacity-70 hover:opacity-100"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Total Requests
          </p>

          <p className="mt-2 text-2xl font-bold">
            {total}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            New
          </p>

          <p className="mt-2 text-2xl font-bold">
            {requests.filter((r) => r.status === "new").length}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Quoted
          </p>

          <p className="mt-2 text-2xl font-bold">
            {requests.filter((r) => r.status === "quoted").length}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Accepted
          </p>

          <p className="mt-2 text-2xl font-bold">
            {requests.filter((r) => r.status === "accepted").length}
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              Request List
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {filtersActive
                ? `${total} request${total === 1 ? "" : "s"} match the filters.`
                : "Requests submitted by website customers."}
            </p>
          </div>

          {canDelete && selectedIds.length > 0 && (
            <button
              onClick={bulkDelete}
              disabled={actions.bulkRemove.isPending}
              className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {actions.bulkRemove.isPending ? "Deleting..." : `Delete Selected (${selectedIds.length})`}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-gray-200 px-6 py-4 sm:grid-cols-2">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Search reference, company, name, email, product…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              resetPage();
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black"
          >
            <option value="">All statuses</option>
            <option value="new,reviewing,contacted,quoted,accepted">Open (not rejected / converted)</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {prettyStatus(status)}
              </option>
            ))}
          </select>
        </div>

        {listQuery.isLoading ? (
          <LoadingState label="Loading quote requests..." />
        ) : listQuery.error ? (
          <ErrorState error={listQuery.error} onRetry={() => listQuery.refetch()} />
        ) : requests.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-500">
            {filtersActive ? "No quote requests match the current filters." : "No quote requests found."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  {canDelete && (
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={requests.length > 0 && selectedIds.length === requests.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                  )}

                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Reference
                  </th>

                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Customer
                  </th>

                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Product
                  </th>

                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Quantity
                  </th>

                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>

                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Submitted
                  </th>

                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {requests.map((request) => {
                  const busy = busyId === request.id;
                  return (
                    <tr key={request.id} className="hover:bg-gray-50">
                      {canDelete && (
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(request.id)}
                            onChange={() => toggleSelect(request.id)}
                          />
                        </td>
                      )}

                      <td className="px-4 py-4">
                        <p className="font-medium text-gray-900">
                          {request.reference_number}
                        </p>
                        {request.assigned?.full_name && (
                          <p className="mt-1 text-xs text-gray-500">
                            {request.assigned.full_name}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-4">
                        <p className="font-medium text-gray-900">
                          {request.company}
                        </p>

                        <p className="text-sm text-gray-600">
                          {request.full_name}
                        </p>

                        <p className="text-xs text-gray-500">
                          {request.email}
                        </p>
                      </td>

                      <td className="px-4 py-4 text-sm text-gray-700">
                        {request.product_name || "—"}
                      </td>

                      <td className="px-4 py-4 text-sm text-gray-700">
                        {request.quantity_kg ? formatKg(request.quantity_kg) : "—"}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex flex-col items-start gap-2">
                          <StatusBadge status={request.status} />
                          {canUpdate && (
                            <StatusActions
                              entity="quote_request"
                              status={request.status}
                              exclude={["converted"]}
                              disabled={busy}
                              onChange={(next) => updateStatus(request, next)}
                            />
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4 text-sm text-gray-600">
                        {formatDateTime(request.created_at)}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          {canConvert && request.status === "accepted" && (
                            <button
                              onClick={() => convertToOrder(request)}
                              disabled={busy}
                              className="rounded-lg bg-black px-3 py-2 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                            >
                              {busy && actions.convert.isPending ? "Converting..." : "Convert to Order"}
                            </button>
                          )}

                          {request.status === "converted" && (
                            <button
                              onClick={() => navigate("/admin/orders")}
                              className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-xs font-medium text-green-700 hover:bg-green-100"
                            >
                              {request.orders?.length
                                ? request.orders.map((o) => o.order_number).join(", ")
                                : "Open Order"}
                            </button>
                          )}

                          <button
                            onClick={() => setSelectedId(request.id)}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium hover:bg-gray-50"
                          >
                            View
                          </button>

                          {canDelete && (
                            <button
                              onClick={() => deleteRequest(request)}
                              disabled={busy}
                              className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={page}
          limit={PAGE_SIZE}
          total={total}
          onPage={(p) => {
            setPage(p);
            setSelectedIds([]);
          }}
        />
      </div>

      {/* Details Modal */}
      {selectedId && (
        <QuoteDetailModal
          id={selectedId}
          onClose={() => setSelectedId(null)}
          canUpdate={canUpdate}
          canConvert={canConvert}
          onConverted={(orderNumber) => {
            setConvertedOrder(orderNumber);
          }}
          onOpenOrders={() => {
            setSelectedId(null);
            navigate("/admin/orders");
          }}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Detail modal
// -----------------------------------------------------------------------------
function QuoteDetailModal({
  id,
  onClose,
  canUpdate,
  canConvert,
  onConverted,
  onOpenOrders,
}: {
  id: string;
  onClose: () => void;
  canUpdate: boolean;
  canConvert: boolean;
  onConverted: (orderNumber: string) => void;
  onOpenOrders: () => void;
}) {
  const { data: quote, isLoading, error, refetch } = useQuoteRequest(id);
  const directory = useDirectory(["sales", "admin", "super_admin"]);
  const actions = useQuoteActions();
  const flash = useFlash();
  const { confirm, dialog } = useConfirm();
  const [newOrder, setNewOrder] = useState<string | null>(null);

  const converted = quote?.status === "converted";
  const itemsLocked = !quote || converted || quote.status === "rejected";
  const editable = canUpdate && !converted;

  async function changeStatus(next: string) {
    if (!quote) return;
    const status = next as QuoteStatus;
    const reason = await askStatusReason(confirm, status);
    if (reason === false) return;
    try {
      await actions.setStatus.mutateAsync({ id: quote.id, status, reason });
      flash.success(`Status changed to ${prettyStatus(status)}.`);
    } catch (err) {
      flash.error(err);
    }
  }

  async function convert() {
    if (!quote) return;
    const ok = await confirm({
      title: `Convert ${quote.reference_number} to a sales order?`,
      message:
        "A draft sales order is created from the quote and its priced items. The quote becomes read-only.",
      confirmLabel: "Convert",
    });
    if (!ok) return;
    try {
      const order = await actions.convert.mutateAsync(quote.id);
      setNewOrder(order.order_number);
      onConverted(order.order_number);
      flash.clear();
    } catch (err) {
      flash.error(err);
    }
  }

  async function assign(value: string) {
    if (!quote) return;
    try {
      await actions.assign.mutateAsync({ id: quote.id, assigned_to: value || null });
      flash.success(value ? "Salesperson assigned." : "Assignment removed.");
    } catch (err) {
      flash.error(err);
    }
  }

  async function linkCustomer() {
    if (!quote) return;
    try {
      const updated = await actions.linkCustomer.mutateAsync(quote.id);
      flash.success(
        updated.customer
          ? `Linked to customer ${updated.customer.company_name} (${updated.customer.customer_code}).`
          : "Customer linked."
      );
    } catch (err) {
      flash.error(err);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      {dialog}
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold">
              {quote?.reference_number ?? "Quote Request"}
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Quote Request Details
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        {isLoading ? (
          <LoadingState label="Loading quote request..." />
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : !quote ? null : (
          <div className="space-y-8 p-6">
            {flash.banner}

            {newOrder && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                <span>
                  Converted to draft Sales Order <strong>{newOrder}</strong>.
                </span>
                <button
                  type="button"
                  onClick={onOpenOrders}
                  className="rounded-lg border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
                >
                  Open Sales Orders →
                </button>
              </div>
            )}

            {/* Customer */}
            <section>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Customer Information
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Info label="Full Name" value={quote.full_name} />
                <Info label="Company" value={quote.company} />
                <Info label="Email" value={quote.email} />
                <Info label="Phone" value={quote.phone} />
                <Info label="Country" value={quote.country} />
                <Info label="Destination Port" value={quote.destination_port} />
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
                {quote.customer ? (
                  <span className="text-gray-700">
                    Customer record:{" "}
                    <strong>{quote.customer.company_name}</strong> ({quote.customer.customer_code}
                    {quote.customer.country ? ` · ${quote.customer.country}` : ""})
                  </span>
                ) : (
                  <>
                    <span className="text-gray-600">Not linked to a customer record yet.</span>
                    {editable && (
                      <button
                        type="button"
                        onClick={linkCustomer}
                        disabled={actions.linkCustomer.isPending}
                        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-gray-100 disabled:opacity-50"
                      >
                        {actions.linkCustomer.isPending ? "Linking..." : "Link / create customer"}
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>

            {/* Coffee */}
            <section>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Coffee Requirements
              </h3>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Info label="Product" value={quote.product_name} />
                <Info label="Region" value={quote.region_name} />
                <Info label="Grade" value={quote.grade} />
                <Info label="Processing" value={quote.processing} />
                <Info label="Quantity" value={quote.quantity_kg ? formatKg(quote.quantity_kg) : null} />
                <Info label="Packaging" value={quote.packaging} />
                <Info label="Target Shipment" value={quote.target_shipment} />
                <Info label="Certifications" value={quote.certifications?.join(", ") || null} />
              </div>
            </section>

            {/* Message */}
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Customer Message
              </h3>

              <div className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
                {quote.message || "No message provided."}
              </div>
            </section>

            {/* Quotation */}
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Quotation
              </h3>

              <QuoteItemsTable
                quote={quote}
                locked={!canUpdate || itemsLocked}
                onError={flash.error}
                onSuccess={flash.success}
              />

              <QuotationFields
                key={quote.id}
                quote={quote}
                disabled={!editable}
                onError={flash.error}
                onSuccess={flash.success}
              />
            </section>

            {/* Status */}
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Request Status
              </h3>

              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge status={quote.status} />

                {canUpdate && (
                  <StatusActions
                    entity="quote_request"
                    status={quote.status}
                    exclude={["converted"]}
                    disabled={actions.setStatus.isPending}
                    onChange={changeStatus}
                  />
                )}

                {canConvert && quote.status === "accepted" && (
                  <button
                    type="button"
                    onClick={convert}
                    disabled={actions.convert.isPending}
                    className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    {actions.convert.isPending ? "Converting..." : "Convert to Sales Order"}
                  </button>
                )}

                {converted && (
                  <button
                    type="button"
                    onClick={onOpenOrders}
                    className="rounded-lg border border-green-300 bg-green-50 px-4 py-2.5 text-sm font-medium text-green-700 hover:bg-green-100"
                  >
                    {quote.orders?.length
                      ? `Sales Order ${quote.orders.map((o) => o.order_number).join(", ")} →`
                      : "Open Sales Order →"}
                  </button>
                )}
              </div>

              {!!quote.orders?.length && !converted && (
                <p className="mt-2 text-xs text-gray-500">
                  Linked orders: {quote.orders.map((o) => `${o.order_number} (${prettyStatus(o.status)})`).join(", ")}
                </p>
              )}
              {quote.status === "quoted" && (
                <p className="mt-2 text-xs text-gray-500">
                  Mark the quote as accepted once the customer agrees; only accepted quotes can be converted to a sales order.
                </p>
              )}
            </section>

            {/* Assignment */}
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Assigned Salesperson
              </h3>

              {canUpdate ? (
                <select
                  value={quote.assigned_to ?? ""}
                  onChange={(e) => assign(e.target.value)}
                  disabled={actions.assign.isPending || directory.isLoading}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-black md:w-80"
                >
                  <option value="">Unassigned</option>
                  {quote.assigned_to &&
                    !(directory.data ?? []).some((p) => p.id === quote.assigned_to) && (
                      <option value={quote.assigned_to}>
                        {quote.assigned?.full_name ?? "Current assignee"}
                      </option>
                    )}
                  {(directory.data ?? []).map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name || person.email || person.id}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-900">{quote.assigned?.full_name ?? "Unassigned"}</p>
              )}
            </section>

            {/* Admin Notes */}
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">
                Admin Notes
              </h3>

              <AdminNotes
                key={`${quote.id}:${quote.admin_notes ?? ""}`}
                request={quote}
                disabled={!editable}
                onError={flash.error}
                onSuccess={flash.success}
              />
            </section>

            {/* Documents */}
            <section>
              <DocumentsPanel relatedType="quote_request" relatedId={quote.id} defaultType="quotation" />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>

      <p className="mt-1 text-sm text-gray-900">
        {value || "—"}
      </p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Quote items (priced lines)
// -----------------------------------------------------------------------------
type ItemForm = {
  description: string;
  grade: string;
  processing_method: string;
  quantity_kg: string;
  unit_price: string;
  currency: string;
};

const itemFormFrom = (quote: QuoteRequestDetail, item?: QuoteItem): ItemForm =>
  item
    ? {
        description: item.description,
        grade: item.grade ?? "",
        processing_method: item.processing_method ?? "",
        quantity_kg: String(item.quantity_kg),
        unit_price: item.unit_price == null ? "" : String(item.unit_price),
        currency: item.currency || quote.currency || "USD",
      }
    : {
        description: quote.items.length ? "" : quote.product_name ?? "",
        grade: quote.items.length ? "" : quote.grade ?? "",
        processing_method: quote.items.length ? "" : quote.processing ?? "",
        quantity_kg: quote.items.length || !quote.quantity_kg ? "" : String(quote.quantity_kg),
        unit_price: "",
        currency: quote.currency || "USD",
      };

function validateItem(form: ItemForm): string | null {
  if (!form.description.trim()) return "Enter a description for the item.";
  const qty = Number(form.quantity_kg);
  if (!form.quantity_kg || !Number.isFinite(qty) || qty <= 0) return "Quantity must be greater than 0 kg.";
  if (form.unit_price !== "") {
    const price = Number(form.unit_price);
    if (!Number.isFinite(price) || price < 0) return "Unit price must be 0 or more.";
  }
  return null;
}

const itemBody = (form: ItemForm) => ({
  description: form.description.trim(),
  grade: form.grade.trim() || null,
  processing_method: form.processing_method.trim() || null,
  quantity_kg: Number(form.quantity_kg),
  unit_price: form.unit_price === "" ? null : Number(form.unit_price),
  currency: form.currency,
});

function QuoteItemsTable({
  quote,
  locked,
  onError,
  onSuccess,
}: {
  quote: QuoteRequestDetail;
  locked: boolean;
  onError: (err: unknown) => void;
  onSuccess: (msg: string) => void;
}) {
  const actions = useQuoteActions();
  const { confirm, dialog } = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<ItemForm>(() => itemFormFrom(quote));
  const pending = actions.addItem.isPending || actions.updateItem.isPending || actions.removeItem.isPending;

  const set = (name: keyof ItemForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [name]: e.target.value }));

  function startAdd() {
    setEditingId(null);
    setForm(itemFormFrom(quote));
    setAdding(true);
  }

  function startEdit(item: QuoteItem) {
    setAdding(false);
    setForm(itemFormFrom(quote, item));
    setEditingId(item.id);
  }

  function cancel() {
    setAdding(false);
    setEditingId(null);
  }

  async function save() {
    const problem = validateItem(form);
    if (problem) return onError(new Error(problem));
    try {
      if (editingId) {
        await actions.updateItem.mutateAsync({ id: quote.id, itemId: editingId, body: itemBody(form) });
        onSuccess("Quote item updated.");
      } else {
        await actions.addItem.mutateAsync({
          id: quote.id,
          body: { ...itemBody(form), sort_order: quote.items.length },
        });
        onSuccess("Quote item added.");
      }
      cancel();
    } catch (err) {
      onError(err);
    }
  }

  async function remove(item: QuoteItem) {
    const ok = await confirm({
      title: "Remove this item?",
      message: `"${item.description}" will be removed from the quotation.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await actions.removeItem.mutateAsync({ id: quote.id, itemId: item.id });
      onSuccess("Quote item removed.");
      if (editingId === item.id) cancel();
    } catch (err) {
      onError(err);
    }
  }

  const cellInput = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-black";
  const editorRow = (key: string) => (
    <tr key={key} className="bg-gray-50">
      <td className="px-3 py-2">
        <input className={cellInput} value={form.description} onChange={set("description")} placeholder="Description *" maxLength={300} />
      </td>
      <td className="px-3 py-2">
        <input className={cellInput} value={form.grade} onChange={set("grade")} placeholder="G1" maxLength={40} />
      </td>
      <td className="px-3 py-2">
        <input className={cellInput} value={form.processing_method} onChange={set("processing_method")} placeholder="Washed" maxLength={60} />
      </td>
      <td className="px-3 py-2">
        <input className={cellInput} type="number" min="0" step="any" value={form.quantity_kg} onChange={set("quantity_kg")} placeholder="kg *" />
      </td>
      <td className="px-3 py-2">
        <input className={cellInput} type="number" min="0" step="any" value={form.unit_price} onChange={set("unit_price")} placeholder="per kg" />
      </td>
      <td className="px-3 py-2">
        <select className={cellInput} value={form.currency} onChange={set("currency")}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 text-right text-sm text-gray-700">
        {form.unit_price !== "" && form.quantity_kg
          ? formatMoney(Number(form.unit_price) * Number(form.quantity_kg), form.currency)
          : "—"}
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {pending ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            onClick={cancel}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="mb-6">
      {dialog}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-gray-50">
            <tr>
              {["Description", "Grade", "Processing", "Quantity", "Unit price", "Currency", "Line total", ""].map((h, i) => (
                <th
                  key={i}
                  className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 ${i === 6 ? "text-right" : ""}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {quote.items.length === 0 && !adding && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-sm text-gray-500">
                  No quotation items yet.{" "}
                  {!locked && "Add the coffees and prices you are offering."}
                </td>
              </tr>
            )}
            {quote.items.map((item) =>
              editingId === item.id ? (
                editorRow(item.id)
              ) : (
                <tr key={item.id}>
                  <td className="px-3 py-2 text-gray-900">
                    {item.description}
                    {item.notes && <p className="text-xs text-gray-500">{item.notes}</p>}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{item.grade || "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{item.processing_method || "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{formatKg(item.quantity_kg)}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {item.unit_price == null ? "—" : formatMoney(item.unit_price, item.currency)}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{item.currency}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">
                    {item.unit_price == null ? "—" : formatMoney(Number(item.unit_price) * Number(item.quantity_kg), item.currency)}
                  </td>
                  <td className="px-3 py-2">
                    {!locked && (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          disabled={pending}
                          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(item)}
                          disabled={pending}
                          className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            )}
            {adding && editorRow("new")}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td colSpan={6} className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                Quotation total
              </td>
              <td className="px-3 py-2 text-right font-semibold text-gray-900">
                {quote.quotation_total == null ? "—" : formatMoney(quote.quotation_total, quote.currency || quote.items[0]?.currency)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {!locked && !adding && !editingId && (
        <button
          type="button"
          onClick={startAdd}
          className="mt-3 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          + Add Item
        </button>
      )}
      {locked && (quote.status === "converted" || quote.status === "rejected") && (
        <p className="mt-2 text-xs text-gray-500">
          Items can no longer change because the quote is {quote.status}.
        </p>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Quotation terms
// -----------------------------------------------------------------------------
function QuotationFields({
  quote,
  disabled,
  onError,
  onSuccess,
}: {
  quote: QuoteRequestDetail;
  disabled: boolean;
  onError: (err: unknown) => void;
  onSuccess: (msg: string) => void;
}) {
  const actions = useQuoteActions();
  const [form, setForm] = useState({
    currency: quote.currency || "USD",
    incoterm: quote.incoterm ?? "",
    payment_terms: quote.payment_terms ?? "",
    valid_until: quote.valid_until ? quote.valid_until.slice(0, 10) : "",
    quotation_notes: quote.quotation_notes ?? "",
  });

  const set = (name: keyof typeof form) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [name]: e.target.value }));

  async function save() {
    try {
      await actions.update.mutateAsync({
        id: quote.id,
        body: {
          currency: form.currency,
          incoterm: form.incoterm.trim() || null,
          payment_terms: form.payment_terms.trim() || null,
          valid_until: form.valid_until || null,
          quotation_notes: form.quotation_notes.trim() || null,
        },
      });
      onSuccess("Quotation terms saved.");
    } catch (err) {
      onError(err);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Currency</label>
        <select value={form.currency} onChange={set("currency")} disabled={disabled} className={`${inputClass} bg-white`}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Incoterm</label>
        <input
          list="quote-incoterms"
          value={form.incoterm}
          onChange={set("incoterm")}
          disabled={disabled}
          maxLength={60}
          placeholder="e.g. FOB Djibouti"
          className={inputClass}
        />
        <datalist id="quote-incoterms">
          {INCOTERMS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Payment Terms</label>
        <input
          value={form.payment_terms}
          onChange={set("payment_terms")}
          disabled={disabled}
          maxLength={200}
          placeholder="e.g. 30% advance, 70% against documents"
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Valid Until</label>
        <input type="date" value={form.valid_until} onChange={set("valid_until")} disabled={disabled} className={inputClass} />
      </div>
      <div className="md:col-span-2">
        <label className="mb-1.5 block text-sm font-medium text-gray-700">Quotation Notes</label>
        <textarea
          value={form.quotation_notes}
          onChange={set("quotation_notes")}
          disabled={disabled}
          rows={3}
          maxLength={4000}
          placeholder="Terms or remarks shown with the quotation"
          className={inputClass}
        />
      </div>
      {!disabled && (
        <div className="md:col-span-2">
          <button
            type="button"
            onClick={save}
            disabled={actions.update.isPending}
            className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {actions.update.isPending ? "Saving..." : "Save Quotation Terms"}
          </button>
        </div>
      )}
    </div>
  );
}

function AdminNotes({
  request,
  disabled,
  onError,
  onSuccess,
}: {
  request: QuoteRequestDetail;
  disabled: boolean;
  onError: (err: unknown) => void;
  onSuccess: (msg: string) => void;
}) {
  const actions = useQuoteActions();
  const [notes, setNotes] = useState(request.admin_notes || "");

  async function saveNotes() {
    try {
      await actions.update.mutateAsync({ id: request.id, body: { admin_notes: notes.trim() || null } });
      onSuccess("Notes saved.");
    } catch (err) {
      onError(err);
    }
  }

  return (
    <div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        maxLength={4000}
        disabled={disabled}
        placeholder="Add internal notes about this quote request..."
        className={inputClass}
      />

      {!disabled && (
        <button
          onClick={saveNotes}
          disabled={actions.update.isPending}
          className="mt-3 rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {actions.update.isPending ? "Saving..." : "Save Notes"}
        </button>
      )}
    </div>
  );
}
