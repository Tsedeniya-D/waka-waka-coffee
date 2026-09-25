import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { useDebounce } from "../../hooks";
import { downloadCsv } from "../../lib/api";
import {
  useCustomer,
  useCustomerActions,
  useCustomers,
  useDirectory,
} from "../../queries/admin";
import {
  ErrorState,
  Field,
  LoadingState,
  Modal,
  Pagination,
  StatusBadge,
  formatDate,
  formatKg,
  formatMoney,
  useConfirm,
  useFlash,
} from "../../components/admin/ui";
import type { Customer, CustomerSource, CustomerStatus } from "../../types";

type CustomerForm = {
  company_name: string;
  contact_person: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  destination_port: string;
  address: string;
  notes: string;
  status: CustomerStatus;
  assigned_to: string;
};

const emptyForm: CustomerForm = {
  company_name: "",
  contact_person: "",
  email: "",
  phone: "",
  country: "",
  city: "",
  destination_port: "",
  address: "",
  notes: "",
  status: "active",
  assigned_to: "",
};

const SOURCES: CustomerSource[] = ["Manual", "Quote Request", "Sample Request", "Contact Message"];
const PAGE_SIZE = 100;

const countries = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Andorra",
  "Angola",
  "Antigua and Barbuda",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahamas",
  "Bahrain",
  "Bangladesh",
  "Barbados",
  "Belarus",
  "Belgium",
  "Belize",
  "Benin",
  "Bhutan",
  "Bolivia",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brazil",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cabo Verde",
  "Cambodia",
  "Cameroon",
  "Canada",
  "Central African Republic",
  "Chad",
  "Chile",
  "China",
  "Colombia",
  "Comoros",
  "Congo",
  "Costa Rica",
  "Croatia",
  "Cuba",
  "Cyprus",
  "Czech Republic",
  "Denmark",
  "Djibouti",
  "Dominica",
  "Dominican Republic",
  "Ecuador",
  "Egypt",
  "El Salvador",
  "Equatorial Guinea",
  "Eritrea",
  "Estonia",
  "Eswatini",
  "Ethiopia",
  "Fiji",
  "Finland",
  "France",
  "Gabon",
  "Gambia",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Grenada",
  "Guatemala",
  "Guinea",
  "Guinea-Bissau",
  "Guyana",
  "Haiti",
  "Honduras",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "Kiribati",
  "Kuwait",
  "Kyrgyzstan",
  "Laos",
  "Latvia",
  "Lebanon",
  "Lesotho",
  "Liberia",
  "Libya",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Madagascar",
  "Malawi",
  "Malaysia",
  "Maldives",
  "Mali",
  "Malta",
  "Marshall Islands",
  "Mauritania",
  "Mauritius",
  "Mexico",
  "Micronesia",
  "Moldova",
  "Monaco",
  "Mongolia",
  "Montenegro",
  "Morocco",
  "Mozambique",
  "Myanmar",
  "Namibia",
  "Nauru",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Nicaragua",
  "Niger",
  "Nigeria",
  "North Korea",
  "North Macedonia",
  "Norway",
  "Oman",
  "Pakistan",
  "Palau",
  "Palestine",
  "Panama",
  "Papua New Guinea",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Romania",
  "Russia",
  "Rwanda",
  "Saint Kitts and Nevis",
  "Saint Lucia",
  "Saint Vincent and the Grenadines",
  "Samoa",
  "San Marino",
  "Sao Tome and Principe",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Seychelles",
  "Sierra Leone",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "Solomon Islands",
  "Somalia",
  "South Africa",
  "South Korea",
  "South Sudan",
  "Spain",
  "Sri Lanka",
  "Sudan",
  "Suriname",
  "Sweden",
  "Switzerland",
  "Syria",
  "Taiwan",
  "Tajikistan",
  "Tanzania",
  "Thailand",
  "Togo",
  "Tonga",
  "Trinidad and Tobago",
  "Tunisia",
  "Turkey",
  "Turkmenistan",
  "Tuvalu",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Uzbekistan",
  "Vanuatu",
  "Vatican City",
  "Venezuela",
  "Vietnam",
  "Yemen",
  "Zambia",
  "Zimbabwe",
];

const inputClass =
  "w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-black";

function SourceBadge({ source }: { source: string | null }) {
  const colorMap: Record<string, string> = {
    "Sample Request": "bg-emerald-100 text-emerald-700 border border-emerald-200",
    "Quote Request": "bg-blue-100 text-blue-700 border border-blue-200",
    "Contact Message": "bg-amber-100 text-amber-800 border border-amber-200",
    Manual: "bg-gray-100 text-gray-700 border border-gray-200",
  };
  const key = source || "Manual";
  const cls = colorMap[key] || colorMap["Manual"];
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {key}
    </span>
  );
}

export default function AdminCustomers() {
  const { can, isAdmin } = useAuth();
  const canCreate = can("customers", "create");
  const canUpdate = can("customers", "update");
  const canDelete = isAdmin && can("customers", "delete");

  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | CustomerStatus>("");
  const [sourceFilter, setSourceFilter] = useState<"" | CustomerSource>("");
  const [countryFilter, setCountryFilter] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, { delay: 350 });

  const customersQuery = useCustomers({
    search: debouncedSearch.trim() || undefined,
    status: statusFilter || undefined,
    source: sourceFilter || undefined,
    country: countryFilter || undefined,
    page,
    limit: PAGE_SIZE,
  });
  const customers = customersQuery.data?.data ?? [];
  const total = customersQuery.data?.meta.total ?? 0;
  const filtersActive = Boolean(debouncedSearch.trim() || statusFilter || sourceFilter || countryFilter);

  const directory = useDirectory(["sales", "admin", "super_admin"]);
  const actions = useCustomerActions();
  const flash = useFlash();
  const { confirm, dialog } = useConfirm();
  const saving = actions.create.isPending || actions.update.isPending;
  const deleting = actions.remove.isPending || actions.bulkRemove.isPending;

  const resetPage = () => {
    setPage(1);
    setSelectedIds([]);
  };

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function openAddForm() {
    setEditingId(null);
    setForm(emptyForm);
    flash.clear();
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function editCustomer(customer: Customer) {
    setEditingId(customer.id);
    setForm({
      company_name: customer.company_name || "",
      contact_person: customer.contact_person || "",
      email: customer.email || "",
      phone: customer.phone || "",
      country: customer.country || "",
      city: customer.city || "",
      destination_port: customer.destination_port || "",
      address: customer.address || "",
      notes: customer.notes || "",
      status: customer.status || "active",
      assigned_to: customer.assigned_to || "",
    });
    flash.clear();
    setViewId(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (form.company_name.trim().length < 2) {
      flash.error(new Error("Company Name is required (at least 2 characters)."));
      return;
    }
    if (!form.country) {
      flash.error(new Error("Country is required."));
      return;
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      flash.error(new Error("Enter a valid email address."));
      return;
    }

    // `source` is never sent: the API records how the customer first arrived.
    const payload = {
      company_name: form.company_name.trim(),
      contact_person: form.contact_person.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      country: form.country,
      city: form.city.trim() || null,
      destination_port: form.destination_port.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
      status: form.status,
      assigned_to: form.assigned_to || null,
    };

    try {
      if (editingId) {
        await actions.update.mutateAsync({ id: editingId, body: payload });
        flash.success("Customer updated successfully.");
        closeForm();
      } else {
        const created = await actions.create.mutateAsync(payload);
        flash.success(`Customer created successfully. Customer Code: ${created.customer_code}`);
        setForm(emptyForm);
      }
    } catch (err) {
      flash.error(err);
    }
  }

  async function deleteCustomer(customer: Customer) {
    const ok = await confirm({
      title: "Delete customer?",
      message: `${customer.company_name} (${customer.customer_code}) will be permanently deleted. Customers with quotes, samples or orders cannot be deleted — mark them inactive instead.`,
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      await actions.remove.mutateAsync(customer.id);
      flash.success("Customer deleted successfully.");
      setSelectedIds((prev) => prev.filter((id) => id !== customer.id));
      if (viewId === customer.id) setViewId(null);
    } catch (err) {
      flash.error(err);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((selectedId) => selectedId !== id) : [...prev, id]
    );
  }

  function toggleSelectAll() {
    if (customers.length > 0 && selectedIds.length === customers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(customers.map((customer) => customer.id));
    }
  }

  async function bulkDelete() {
    if (selectedIds.length === 0) return;
    const ok = await confirm({
      title: `Delete ${selectedIds.length} customer(s)?`,
      message:
        "If any selected customer has quotes, samples or orders, nothing is deleted and you will see an error. Mark such customers inactive instead.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await actions.bulkRemove.mutateAsync(selectedIds);
      flash.success(`${result.deleted.length} customer(s) deleted successfully.`);
      setSelectedIds([]);
    } catch (err) {
      flash.error(err);
    }
  }

  function downloadCSV() {
    if (customers.length === 0) return;
    downloadCsv(
      "customers.csv",
      [
        "Customer Code",
        "Company Name",
        "Contact Person",
        "Country",
        "City",
        "Destination Port",
        "Phone",
        "Email",
        "Address",
        "Status",
        "Source",
        "Assigned To",
        "Created At",
      ],
      customers.map((customer) => [
        customer.customer_code,
        customer.company_name,
        customer.contact_person,
        customer.country,
        customer.city,
        customer.destination_port,
        customer.phone,
        customer.email,
        customer.address,
        customer.status,
        customer.source || "Manual",
        customer.assigned?.full_name,
        customer.created_at,
      ])
    );
  }

  const countryOptions =
    form.country && !countries.includes(form.country) ? [form.country, ...countries] : countries;

  return (
    <div className="space-y-6">
      {dialog}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="mt-1 text-sm text-gray-500">
            All customers created manually OR automatically from Sample /
            Quote Requests appear here.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={downloadCSV}
            disabled={customers.length === 0}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
          >
            Download CSV
          </button>

          {(canCreate || (showForm && editingId)) && (
            <button
              onClick={showForm ? closeForm : openAddForm}
              className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              {showForm ? "Close Form" : "Add Customer"}
            </button>
          )}
        </div>
      </div>

      {flash.banner}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <div className="mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              {editingId ? "Edit Customer" : "Customer Information"}
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Customer code is generated automatically by the system.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Customer Code
              </label>

              <input
                type="text"
                value={
                  editingId
                    ? customers.find((c) => c.id === editingId)?.customer_code || "Existing code"
                    : "Generated automatically"
                }
                disabled
                className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2.5 text-sm text-gray-500"
              />

              <p className="mt-1 text-xs text-gray-500">
                Generated automatically after saving.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Company Name *
              </label>

              <input
                type="text"
                name="company_name"
                value={form.company_name}
                onChange={handleChange}
                placeholder="Enter company name"
                maxLength={200}
                className={inputClass}
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Contact Person
              </label>

              <input
                type="text"
                name="contact_person"
                value={form.contact_person}
                onChange={handleChange}
                placeholder="Jane Roaster"
                maxLength={120}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Country *
              </label>

              <select
                name="country"
                value={form.country}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-black"
                required
              >
                <option value="">Select country</option>

                {countryOptions.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                City
              </label>

              <input
                type="text"
                name="city"
                value={form.city}
                onChange={handleChange}
                placeholder="e.g. Hamburg"
                maxLength={120}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Destination Port
              </label>

              <input
                type="text"
                name="destination_port"
                value={form.destination_port}
                onChange={handleChange}
                placeholder="e.g. Port of Rotterdam"
                maxLength={120}
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Phone
              </label>

              <input
                type="text"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="Enter phone number"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Email
              </label>

              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="contact@company.com"
                className={inputClass}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Status
              </label>

              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-black"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Assigned Salesperson
              </label>

              <select
                name="assigned_to"
                value={form.assigned_to}
                onChange={handleChange}
                disabled={directory.isLoading}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-black"
              >
                <option value="">Unassigned</option>
                {(directory.data ?? []).map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.full_name || person.email || person.id}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Address
              </label>

              <textarea
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="Full address"
                rows={3}
                maxLength={500}
                className={inputClass}
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Internal Notes
              </label>

              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Preferences, history, anything the team should know"
                rows={3}
                maxLength={4000}
                className={inputClass}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-black px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? "Saving..." : editingId ? "Update Customer" : "Save Customer"}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              Customer List
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              {total} customer
              {total !== 1 ? "s" : ""} {filtersActive ? "match the filters" : "registered"}
            </p>
          </div>

          {canDelete && selectedIds.length > 0 && (
            <button
              onClick={bulkDelete}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : `Delete Selected (${selectedIds.length})`}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-gray-200 px-6 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Search company, code, contact, email…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-black"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "" | CustomerStatus);
              resetPage();
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value as "" | CustomerSource);
              resetPage();
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black"
          >
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={countryFilter}
            onChange={(e) => {
              setCountryFilter(e.target.value);
              resetPage();
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-black"
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {customersQuery.isLoading ? (
          <LoadingState label="Loading customers..." />
        ) : customersQuery.error ? (
          <ErrorState error={customersQuery.error} onRetry={() => customersQuery.refetch()} />
        ) : customers.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-500">
            {filtersActive
              ? "No customers match the current filters."
              : "No customers found yet. Add one manually, or submit a public Sample / Quote Request."}
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
                        checked={customers.length > 0 && selectedIds.length === customers.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                  )}

                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Company
                  </th>

                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Source
                  </th>

                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Contact
                  </th>

                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Location
                  </th>

                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Salesperson
                  </th>

                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>

                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    {canDelete && (
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(customer.id)}
                          onChange={() => toggleSelect(customer.id)}
                        />
                      </td>
                    )}

                    <td className="px-4 py-4">
                      <button type="button" onClick={() => setViewId(customer.id)} className="text-left">
                        <p className="font-medium text-gray-900 hover:underline">
                          {customer.company_name}
                        </p>

                        <p className="mt-1 text-xs text-gray-500">
                          {customer.customer_code}
                        </p>
                      </button>
                    </td>

                    <td className="px-4 py-4 text-sm text-gray-700">
                      <SourceBadge source={customer.source} />
                    </td>

                    <td className="px-4 py-4 text-sm text-gray-700">
                      <div>{customer.contact_person || "—"}</div>
                      <div className="text-xs text-gray-500">
                        {customer.email || ""}
                      </div>
                      <div className="text-xs text-gray-500">
                        {customer.phone || ""}
                      </div>
                    </td>

                    <td className="px-4 py-4 text-sm text-gray-700">
                      <div>
                        {customer.country || "—"}
                        {customer.city ? `, ${customer.city}` : ""}
                      </div>
                      {customer.destination_port && (
                        <div className="text-xs text-gray-500">
                          Port: {customer.destination_port}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-4 text-sm text-gray-700">
                      {customer.assigned?.full_name || <span className="text-gray-400">Unassigned</span>}
                    </td>

                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          customer.status === "active"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {customer.status}
                      </span>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setViewId(customer.id)}
                          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium hover:bg-gray-50"
                        >
                          View
                        </button>

                        {canUpdate && (
                          <button
                            onClick={() => editCustomer(customer)}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium hover:bg-gray-50"
                          >
                            Edit
                          </button>
                        )}

                        {canDelete && (
                          <button
                            onClick={() => deleteCustomer(customer)}
                            disabled={deleting}
                            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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

      <CustomerDetailModal
        id={viewId}
        onClose={() => setViewId(null)}
        onEdit={canUpdate ? editCustomer : undefined}
      />
    </div>
  );
}

function CustomerDetailModal({
  id,
  onClose,
  onEdit,
}: {
  id: string | null;
  onClose: () => void;
  onEdit?: (customer: Customer) => void;
}) {
  const { data: customer, isLoading, error, refetch } = useCustomer(id);

  return (
    <Modal
      open={Boolean(id)}
      size="xl"
      onClose={onClose}
      title={customer ? `${customer.company_name} · ${customer.customer_code}` : "Customer"}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
          {onEdit && customer && (
            <button
              type="button"
              onClick={() => onEdit(customer)}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Edit Customer
            </button>
          )}
        </>
      }
    >
      {isLoading ? (
        <LoadingState label="Loading customer..." />
      ) : error ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : !customer ? null : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={customer.status} />
            <SourceBadge source={customer.source} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Contact person" value={customer.contact_person} />
            <Field
              label="Email"
              value={customer.email ? <a className="underline" href={`mailto:${customer.email}`}>{customer.email}</a> : null}
            />
            <Field label="Phone" value={customer.phone} />
            <Field label="Country" value={[customer.country, customer.city].filter(Boolean).join(", ")} />
            <Field label="Destination port" value={customer.destination_port} />
            <Field label="Assigned salesperson" value={customer.assigned?.full_name || "Unassigned"} />
            <Field label="Address" value={customer.address} />
            <Field label="Created" value={`${formatDate(customer.created_at)}${customer.creator?.full_name ? ` by ${customer.creator.full_name}` : ""}`} />
            <Field label="Totals" value={`${customer.totals.orders} order(s) · ${formatKg(customer.totals.ordered_kg)} ordered`} />
          </div>

          {customer.notes && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{customer.notes}</p>
            </div>
          )}

          <HistoryTable
            title="Quote history"
            empty="No quote requests."
            headers={["Reference", "Product", "Quantity", "Status", "Date"]}
            rows={customer.quote_history.map((q) => ({
              id: q.id,
              cells: [q.reference_number, q.product_name || "—", formatKg(q.quantity_kg), <StatusBadge key="s" status={q.status} />, formatDate(q.created_at)],
            }))}
          />
          <HistoryTable
            title="Sample history"
            empty="No sample requests."
            headers={["Reference", "Product", "Quantity", "Tracking", "Status", "Date"]}
            rows={customer.sample_history.map((s) => ({
              id: s.id,
              cells: [
                s.reference_number,
                s.product_name || "—",
                formatKg(s.sample_quantity),
                s.tracking_number || "—",
                <StatusBadge key="s" status={s.status} />,
                formatDate(s.created_at),
              ],
            }))}
          />
          <HistoryTable
            title="Order history"
            empty="No sales orders."
            headers={["Order", "Product", "Quantity", "Unit price", "Status", "Date"]}
            rows={customer.order_history.map((o) => ({
              id: o.id,
              cells: [
                o.order_number,
                o.product_name || "—",
                formatKg(o.quantity_kg),
                formatMoney(o.unit_price, o.currency),
                <StatusBadge key="s" status={o.status} />,
                formatDate(o.created_at),
              ],
            }))}
          />
        </div>
      )}
    </Modal>
  );
}

function HistoryTable({
  title,
  empty,
  headers,
  rows,
}: {
  title: string;
  empty: string;
  headers: string[];
  rows: { id: string; cells: React.ReactNode[] }[];
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-700">
        {title} ({rows.length})
      </h3>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 px-4 py-3 text-sm text-gray-500">{empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                {headers.map((h) => (
                  <th key={h} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((r) => (
                <tr key={r.id}>
                  {r.cells.map((c, i) => (
                    <td key={i} className="px-3 py-2 text-gray-700">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
