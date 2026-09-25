import PageHeader from '../components/PageHeader'
import { Link, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useCreateSampleRequest } from '../queries'
import { errorMessage } from '../lib/api'
import { sampleRequestSchema } from '../lib/schemas'
import {
  Send,
  Package,
  User,
  Mail,
  Phone,
  Globe2,
  MapPin,
  StickyNote,
  FileText,
  Coffee,
  ArrowLeft,
  Truck,
  CheckCircle2,
} from 'lucide-react'

const countries = [
  'Australia',
  'Austria',
  'Belgium',
  'Brazil',
  'Canada',
  'China',
  'Denmark',
  'Ethiopia',
  'Finland',
  'France',
  'Germany',
  'India',
  'Ireland',
  'Italy',
  'Japan',
  'Kenya',
  'Netherlands',
  'New Zealand',
  'Norway',
  'Poland',
  'Portugal',
  'South Africa',
  'South Korea',
  'Spain',
  'Sweden',
  'Switzerland',
  'Tanzania',
  'United Arab Emirates',
  'United Kingdom',
  'United States',
  'Other',
]

const RequestSample = () => {
  const products = [
    'Select a coffee (optional)',
    'Sidama Grade 1 — Washed',
    'Yirgacheffe Heirloom — Washed',
    'Guji — Natural',
    'Harrar Longberry — Natural',
    'Limu — Washed',
    'Jimma — Washed',
    'Kaffa Heirloom — Washed',
    'Surprise me with a sample set',
  ]

  const qtyOptions = [
    'Standard 200g green sample (per coffee)',
    'Standard 200g roasted sample (per coffee)',
    '500g evaluation pack',
    '1kg trade pack',
    'Custom — I will specify in notes',
  ]

  /** Sample format → quantity in kg (custom formats are specified in the notes). */
  const qtyToKg = (opt: string): number | null => {
    const q = opt.toLowerCase()
    if (q.includes('200g')) return 0.2
    if (q.includes('500g')) return 0.5
    if (q.includes('1kg')) return 1
    return null
  }

  const emptyForm = {
    full_name: '',
    company: '',
    email: '',
    phone: '',
    country: '',
    product: '',
    sample_quantity: '',
    shipping_address: '',
    message: '',
  }

  const [form, setForm] = useState(emptyForm)
  const createSample = useCreateSampleRequest()
  const loading = createSample.isPending
  const [error, setError] = useState<string | null>(null)
  const [successRef, setSuccessRef] = useState<string | null>(null)
  const [customerCode, setCustomerCode] = useState<string | null>(null)
  const [isNewCustomer, setIsNewCustomer] = useState(false)

  const [searchParams] = useSearchParams()

  // Prefill the product from the URL, e.g. /request-sample?product=Guji — Natural
  useEffect(() => {
    const p = searchParams.get('product')?.trim()
    if (p) setForm((f) => ({ ...f, product: p }))
  }, [searchParams])

  // A product passed in the URL that is not in the list is added as an option.
  const productOptions =
    form.product && !products.includes(form.product)
      ? [...products, form.product]
      : products

  const updateField = (k: string, v: unknown) => {
    setForm((f) => ({ ...f, [k]: v }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setError(null)
    setSuccessRef(null)
    setCustomerCode(null)
    setIsNewCustomer(false)

    const productName =
      form.product === 'Select a coffee (optional)' ? '' : form.product
    const format = form.sample_quantity
    const notes = form.message.trim()

    const parsed = sampleRequestSchema.safeParse({
      full_name: form.full_name,
      company: form.company,
      email: form.email,
      phone: form.phone,
      country: form.country,
      product_name: productName,
      sample_quantity: format ? qtyToKg(format) : null,
      sample_quantity_unit: 'kg',
      shipping_address: form.shipping_address,
      // Keep the chosen format (green/roasted/custom) visible to the team.
      message: format
        ? `Sample format: ${format}${notes ? `\n\n${notes}` : ''}`
        : notes,
    })

    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ||
          'Please check the form fields.'
      )
      return
    }

    try {
      const result = await createSample.mutateAsync({ ...parsed.data })

      setSuccessRef(result?.reference_number ? String(result.reference_number) : null)
      setCustomerCode(result?.customer_code ? String(result.customer_code) : null)
      setIsNewCustomer(Boolean(result?.is_new_customer))

      // Clear form only after a successful submission
      setForm(emptyForm)
    } catch (err: unknown) {
      // API messages are user-facing (validation, 429 rate limit, network errors).
      setError(errorMessage(err, 'Failed to submit sample request. Please try again.'))
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Request Samples"
        title="Evaluate Our Products First"
        description="Request product evaluation samples. Every sample pack comes with cupping notes, origin cards, and lot information. A unique reference number will be generated automatically after submission."
      />

      <section className="py-20 bg-cream-50">
        <div className="container-x">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

            {/* FORM */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-[2rem] shadow-xl p-8 md:p-12 border border-coffee-100">

                <div className="flex items-center gap-3 mb-8 pb-8 border-b border-coffee-100">
                  <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center">
                    <Coffee className="w-6 h-6 text-primary-700" />
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold text-coffee-950">
                      Sample Request Form
                    </h2>

                    <p className="text-coffee-500 text-sm">
                      We dispatch samples within 3–5 business days via courier.
                    </p>
                  </div>
                </div>

                <form
                  className="space-y-8"
                  onSubmit={handleSubmit}
                >

                  {/* PRODUCT */}
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-widest text-primary-700 mb-4 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Product Samples
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-coffee-800 mb-2">
                          Which Product(s) Would You Like?
                        </label>

                        <select
                          value={form.product}
                          onChange={(e) =>
                            updateField('product', e.target.value)
                          }
                          className="w-full px-5 py-3.5 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all"
                        >
                          <option value="">
                            Select a coffee (optional)
                          </option>

                          {productOptions
                            .filter(
                              (p) =>
                                p !== 'Select a coffee (optional)'
                            )
                            .map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                        </select>

                        <p className="text-xs text-coffee-500 mt-2">
                          Request multiple coffees by listing them in
                          the notes below or include a link to our
                          products page.
                        </p>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-coffee-800 mb-2">
                          Sample Format & Quantity
                        </label>

                        <div className="space-y-2">
                          {qtyOptions.map((opt) => (
                            <label
                              key={opt}
                              className="flex items-center gap-3 p-4 rounded-xl bg-cream-50 border border-coffee-200 hover:border-primary-400 cursor-pointer transition-colors"
                            >
                              <input
                                type="radio"
                                name="sample-qty"
                                checked={
                                  form.sample_quantity === opt
                                }
                                onChange={() =>
                                  updateField(
                                    'sample_quantity',
                                    opt
                                  )
                                }
                                className="accent-primary-600"
                              />

                              <span className="text-coffee-800">
                                {opt}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CUSTOMER DETAILS */}
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-widest text-primary-700 mb-4 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Your Details
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                      <div>
                        <label className="block text-sm font-semibold text-coffee-800 mb-2">
                          Full Name *
                        </label>

                        <input
                          type="text"
                          required
                          value={form.full_name}
                          onChange={(e) =>
                            updateField(
                              'full_name',
                              e.target.value
                            )
                          }
                          placeholder="Jane Roaster"
                          className="w-full px-5 py-3.5 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 placeholder-coffee-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-coffee-800 mb-2">
                          Company *
                        </label>

                        <input
                          type="text"
                          required
                          value={form.company}
                          onChange={(e) =>
                            updateField(
                              'company',
                              e.target.value
                            )
                          }
                          placeholder="Roastery / Import Company"
                          className="w-full px-5 py-3.5 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 placeholder-coffee-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-coffee-800 mb-2">
                          <Mail className="w-3.5 h-3.5 inline mr-1" />
                          Email *
                        </label>

                        <input
                          type="email"
                          required
                          value={form.email}
                          onChange={(e) =>
                            updateField(
                              'email',
                              e.target.value
                            )
                          }
                          placeholder="you@company.com"
                          className="w-full px-5 py-3.5 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 placeholder-coffee-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-coffee-800 mb-2">
                          <Phone className="w-3.5 h-3.5 inline mr-1" />
                          Phone
                        </label>

                        <input
                          type="tel"
                          value={form.phone}
                          onChange={(e) =>
                            updateField(
                              'phone',
                              e.target.value
                            )
                          }
                          placeholder="+1 555 000 0000"
                          className="w-full px-5 py-3.5 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 placeholder-coffee-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-coffee-800 mb-2">
                          <Globe2 className="w-3.5 h-3.5 inline mr-1" />
                          Country *
                        </label>

                        <select
                          required
                          value={form.country}
                          onChange={(e) =>
                            updateField(
                              'country',
                              e.target.value
                            )
                          }
                          className="w-full px-5 py-3.5 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all"
                        >
                          <option value="">
                            Select your country
                          </option>

                          {countries.map((country) => (
                            <option
                              key={country}
                              value={country}
                            >
                              {country}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* SHIPPING */}
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-widest text-primary-700 mb-4 flex items-center gap-2">
                      <Truck className="w-4 h-4" />
                      Shipping Address
                    </h3>

                    <div className="grid grid-cols-1 gap-5">
                      <div>
                        <label className="block text-sm font-semibold text-coffee-800 mb-2 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" />
                          Complete Shipping Address *
                        </label>

                        <textarea
                          rows={4}
                          required
                          value={form.shipping_address}
                          onChange={(e) =>
                            updateField(
                              'shipping_address',
                              e.target.value
                            )
                          }
                          placeholder="Street address, building, postal code, city, state/province, country"
                          className="w-full px-5 py-4 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 placeholder-coffee-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all resize-none"
                        />

                        <p className="text-xs text-coffee-500 mt-2">
                          Courier charges and dispatch method are
                          confirmed by email after we review your
                          address.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* NOTES */}
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-widest text-primary-700 mb-4 flex items-center gap-2">
                      <StickyNote className="w-4 h-4" />
                      Additional Notes
                    </h3>

                    <textarea
                      rows={5}
                      value={form.message}
                      onChange={(e) =>
                        updateField(
                          'message',
                          e.target.value
                        )
                      }
                      placeholder="List multiple coffees, target roast profile, sample preferences (roast degree), DHL/FedEx account number for billing, or any other instructions."
                      className="w-full px-5 py-4 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 placeholder-coffee-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all resize-none"
                    />
                  </div>

                  {/* ERROR */}
                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 text-center">
                      {error}
                    </div>
                  )}

                  {/* SUCCESS */}
                  {successRef && (
                    <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-5 text-center">
                      <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-3" />

                      <p className="font-semibold text-green-800 text-lg">
                        Sample request submitted successfully.
                      </p>

                      {isNewCustomer && customerCode && (
                        <p className="text-sm text-green-700 mt-2">
                          A new customer account has been created for you.
                        </p>
                      )}

                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-lg border border-green-200 bg-white p-3">
                          <p className="text-[10px] uppercase tracking-wider text-green-600 font-semibold">
                            Sample Reference
                          </p>
                          <p className="text-base font-bold text-green-900 mt-0.5">
                            {successRef}
                          </p>
                        </div>

                        {customerCode && (
                          <div className="rounded-lg border border-green-200 bg-white p-3">
                            <p className="text-[10px] uppercase tracking-wider text-green-600 font-semibold">
                              Customer Code
                            </p>
                            <p className="text-base font-bold text-green-900 mt-0.5">
                              {customerCode}
                            </p>
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-green-700 mt-3">
                        We&apos;ll contact you shortly.
                      </p>

                      <button
                        type="button"
                        onClick={() => {
                          setSuccessRef(null)
                          setCustomerCode(null)
                          setIsNewCustomer(false)
                        }}
                        className="mt-4 text-xs text-primary-700 underline hover:text-primary-800"
                      >
                        Submit another sample request
                      </button>
                    </div>
                  )}

                  {/* SUBMIT */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex items-center justify-center gap-3 bg-primary-600 disabled:opacity-60 hover:bg-primary-700 text-white font-semibold px-8 py-4.5 rounded-2xl shadow-xl shadow-primary-600/25 hover:shadow-2xl hover:shadow-primary-600/30 transition-all text-lg"
                  >
                    <Send className="w-5 h-5" />

                    {loading
                      ? 'Submitting…'
                      : 'Submit Sample Request'}
                  </button>

                  <p className="text-sm text-coffee-500 text-center">
                    You will receive a confirmation email with
                    tracking once your samples dispatch.
                  </p>
                </form>
              </div>
            </div>

            {/* SIDEBAR */}
            <div className="space-y-6">

              <div className="bg-gradient-to-br from-coffee-900 to-coffee-950 rounded-[2rem] p-8 text-white shadow-xl">
                <FileText className="w-8 h-8 text-primary-400 mb-4" />

                <h3 className="text-xl font-bold font-serif mb-4">
                  Sample Pack Includes
                </h3>

                <ul className="space-y-3 text-sm">
                  {[
                    '200g per coffee (green or roasted)',
                    'Cupping score & tasting notes',
                    'Origin & farmer information card',
                    'Altitude, process, and grade specs',
                    'Suggested roast profile guidance',
                    'Export lot reference per sample',
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-3"
                    >
                      <CheckCircle2 className="w-4 h-4 text-primary-400 mt-0.5 flex-shrink-0" />

                      <span className="text-coffee-200">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-primary-50 rounded-[2rem] p-8 border border-primary-200">
                <h3 className="text-xl font-bold font-serif text-coffee-950 mb-4">
                  Sample Dispatch Timeline
                </h3>

                <ol className="space-y-4 text-sm">
                  {[
                    [
                      '1 business day',
                      'We confirm request & sample availability',
                    ],
                    [
                      '2–3 business days',
                      'Sample roasting (if roasted) or QC check',
                    ],
                    [
                      '3–5 business days',
                      'Courier dispatch with tracking',
                    ],
                    [
                      '6–10 business days',
                      'Delivered to most global locations',
                    ],
                  ].map(([time, desc], i) => (
                    <li
                      key={i}
                      className="flex gap-4"
                    >
                      <div className="flex-shrink-0 w-24 text-xs font-bold uppercase tracking-wider text-primary-700 pt-0.5">
                        {time}
                      </div>

                      <p className="text-coffee-700 leading-relaxed">
                        {desc}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="bg-white rounded-[2rem] p-8 border border-coffee-100 shadow-lg">
                <h3 className="text-xl font-bold font-serif text-coffee-950 mb-4">
                  Need Something Larger?
                </h3>

                <p className="text-coffee-600 text-sm mb-6 leading-relaxed">
                  If you need 5kg+ evaluation stock or want a
                  formal quotation for a production order, jump
                  directly to our RFQ form.
                </p>

                <Link
                  to="/request-quote"
                  className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold transition-colors shadow-lg"
                >
                  Request Full Quote Instead
                  <span>→</span>
                </Link>

                <Link
                  to="/products"
                  className="mt-3 w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl bg-cream-100 hover:bg-cream-200 font-semibold text-coffee-900 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Browse Coffee Catalog
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default RequestSample

