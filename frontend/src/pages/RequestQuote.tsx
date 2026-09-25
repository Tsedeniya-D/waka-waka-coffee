import PageHeader from '../components/PageHeader'
import { Link, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useCreateQuoteRequest } from '../queries'
import { errorMessage } from '../lib/api'
import { quoteRequestSchema } from '../lib/schemas'
import {
  Send,
  User,
  Mail,
  Phone,
  Globe2,
  Package,
  Leaf,
  Award,
  CalendarDays,
  MessageSquare,
  FileText,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react'

const RequestQuote = () => {
  // =========================================================
  // COUNTRY LIST - ALPHABETICAL
  // =========================================================

  const countries = [
    'Afghanistan',
    'Albania',
    'Algeria',
    'Andorra',
    'Angola',
    'Antigua and Barbuda',
    'Argentina',
    'Armenia',
    'Australia',
    'Austria',
    'Azerbaijan',
    'Bahamas',
    'Bahrain',
    'Bangladesh',
    'Barbados',
    'Belarus',
    'Belgium',
    'Belize',
    'Benin',
    'Bhutan',
    'Bolivia',
    'Bosnia and Herzegovina',
    'Botswana',
    'Brazil',
    'Brunei',
    'Bulgaria',
    'Burkina Faso',
    'Burundi',
    'Cabo Verde',
    'Cambodia',
    'Cameroon',
    'Canada',
    'Central African Republic',
    'Chad',
    'Chile',
    'China',
    'Colombia',
    'Comoros',
    'Congo',
    'Costa Rica',
    'Croatia',
    'Cuba',
    'Cyprus',
    'Czech Republic',
    'Denmark',
    'Djibouti',
    'Dominica',
    'Dominican Republic',
    'Ecuador',
    'Egypt',
    'El Salvador',
    'Equatorial Guinea',
    'Eritrea',
    'Estonia',
    'Eswatini',
    'Ethiopia',
    'Fiji',
    'Finland',
    'France',
    'Gabon',
    'Gambia',
    'Georgia',
    'Germany',
    'Ghana',
    'Greece',
    'Grenada',
    'Guatemala',
    'Guinea',
    'Guinea-Bissau',
    'Guyana',
    'Haiti',
    'Honduras',
    'Hungary',
    'Iceland',
    'India',
    'Indonesia',
    'Iran',
    'Iraq',
    'Ireland',
    'Israel',
    'Italy',
    'Jamaica',
    'Japan',
    'Jordan',
    'Kazakhstan',
    'Kenya',
    'Kiribati',
    'Kuwait',
    'Kyrgyzstan',
    'Laos',
    'Latvia',
    'Lebanon',
    'Lesotho',
    'Liberia',
    'Libya',
    'Liechtenstein',
    'Lithuania',
    'Luxembourg',
    'Madagascar',
    'Malawi',
    'Malaysia',
    'Maldives',
    'Mali',
    'Malta',
    'Marshall Islands',
    'Mauritania',
    'Mauritius',
    'Mexico',
    'Micronesia',
    'Moldova',
    'Monaco',
    'Mongolia',
    'Montenegro',
    'Morocco',
    'Mozambique',
    'Myanmar',
    'Namibia',
    'Nauru',
    'Nepal',
    'Netherlands',
    'New Zealand',
    'Nicaragua',
    'Niger',
    'Nigeria',
    'North Korea',
    'North Macedonia',
    'Norway',
    'Oman',
    'Pakistan',
    'Palau',
    'Palestine',
    'Panama',
    'Papua New Guinea',
    'Paraguay',
    'Peru',
    'Philippines',
    'Poland',
    'Portugal',
    'Qatar',
    'Romania',
    'Russia',
    'Rwanda',
    'Saint Kitts and Nevis',
    'Saint Lucia',
    'Saint Vincent and the Grenadines',
    'Samoa',
    'San Marino',
    'Sao Tome and Principe',
    'Saudi Arabia',
    'Senegal',
    'Serbia',
    'Seychelles',
    'Sierra Leone',
    'Singapore',
    'Slovakia',
    'Slovenia',
    'Solomon Islands',
    'Somalia',
    'South Africa',
    'South Korea',
    'South Sudan',
    'Spain',
    'Sri Lanka',
    'Sudan',
    'Suriname',
    'Sweden',
    'Switzerland',
    'Syria',
    'Taiwan',
    'Tajikistan',
    'Tanzania',
    'Thailand',
    'Timor-Leste',
    'Togo',
    'Tonga',
    'Trinidad and Tobago',
    'Tunisia',
    'Turkey',
    'Turkmenistan',
    'Tuvalu',
    'Uganda',
    'Ukraine',
    'United Arab Emirates',
    'United Kingdom',
    'United States',
    'Uruguay',
    'Uzbekistan',
    'Vanuatu',
    'Vatican City',
    'Venezuela',
    'Vietnam',
    'Yemen',
    'Zambia',
    'Zimbabwe',
  ]

  const regions = [
    'Available on request',
    'Sidama',
    'Yirgacheffe',
    'Guji',
    'Harrar',
    'Limu',
    'Jimma',
    'Kaffa',
  ]

  const grades = [
    'Available on request',
    'G1 — Grade 1',
    'G2 — Grade 2',
    'G3 — Grade 3',
    'G4 — Grade 4',
    'G5 — Grade 5',
  ]

  const processes = [
    'Available on request',
    'Washed / Wet',
    'Natural / Sundried',
    'Honey / Pulped Natural',
    'Anaerobic',
  ]

  const packaging = [
    'Available on request',
    'Standard 60kg jute bags',
    'GrainPro lined jute bags',
    'Vacuum packs (per kg)',
    'Custom private label bags',
  ]

  const certifications = [
    'Organic',
    'Fair Trade',
    'Rainforest Alliance',
    'UTZ / 4C',
    'None required',
  ]

  // =========================================================
  // FORM
  // =========================================================

  const [form, setForm] = useState({
    full_name: '',
    company: '',
    email: '',
    phone: '',
    country: '',
    destination_port: '',
    product: '',
    region: '',
    grade: '',
    processing: '',
    quantity: '',
    packaging: '',
    certifications: [] as string[],
    target_shipment: '',
    message: '',
  })

  const createQuote = useCreateQuoteRequest()
  const loading = createQuote.isPending
  const [error, setError] = useState<string | null>(null)
  const [successRef, setSuccessRef] = useState<string | null>(null)
  const [customerCode, setCustomerCode] = useState<string | null>(null)
  const [isNewCustomer, setIsNewCustomer] = useState(false)

  const [searchParams] = useSearchParams()

  // =========================================================
  // GET PRODUCT FROM URL
  // Example:
  // /request-quote?product=Yirgacheffe
  // =========================================================

  useEffect(() => {
    const p = searchParams.get('product')

    if (p) {
      setForm((f) => ({
        ...f,
        product: p,
      }))
    }
  }, [searchParams])

  // =========================================================
  // UPDATE FORM
  // =========================================================

  const updateField = (key: string, value: unknown) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }))
  }

  // =========================================================
  // SUBMIT QUOTE REQUEST
  // =========================================================

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    setError(null)
    setSuccessRef(null)
    setCustomerCode(null)
    setIsNewCustomer(false)

    // Validate form
    const parsed = quoteRequestSchema.safeParse({
      full_name: form.full_name,
      company: form.company,
      email: form.email,
      phone: form.phone,
      country: form.country,
      destination_port: form.destination_port,
      product_name: form.product,
      region_name: form.region,
      grade: form.grade,
      processing: form.processing,
      quantity_kg: form.quantity,
      packaging: form.packaging,
      certifications: form.certifications,
      target_shipment: form.target_shipment,
      message: form.message,
    })

    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ||
          'Please check the form fields.'
      )
      return
    }

    try {
      const result = await createQuote.mutateAsync({ ...parsed.data })

      setSuccessRef(result?.reference_number ? String(result.reference_number) : null)
      setCustomerCode(result?.customer_code ? String(result.customer_code) : null)
      setIsNewCustomer(Boolean(result?.is_new_customer))

      // Clear form only after a successful submission
      setForm({
        full_name: '',
        company: '',
        email: '',
        phone: '',
        country: '',
        destination_port: '',
        product: '',
        region: '',
        grade: '',
        processing: '',
        quantity: '',
        packaging: '',
        certifications: [],
        target_shipment: '',
        message: '',
      })
    } catch (err: unknown) {
      // API messages are user-facing (validation, 429 rate limit, network errors).
      setError(errorMessage(err, 'Failed to submit request. Please try again.'))
    }
  }

  // =========================================================
  // RETURN
  // =========================================================

  return (
    <div>
      <PageHeader
        eyebrow="Request for Quotation"
        title="Get a Formal Quotation"
        description="Tell us your coffee requirements. We will prepare a detailed quotation with pricing, availability, logistics options, and a unique reference number."
      />

      <section className="py-20 bg-cream-50">
        <div className="container-x">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">

            {/* =================================================
                MAIN FORM
            ================================================= */}

            <div className="lg:col-span-2">
              <div className="bg-white rounded-[2rem] shadow-xl p-8 md:p-12 border border-coffee-100">

                <div className="flex items-center gap-3 mb-8 pb-8 border-b border-coffee-100">
                  <div className="w-12 h-12 rounded-2xl bg-primary-100 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-primary-700" />
                  </div>

                  <div>
                    <h2 className="text-2xl font-bold text-coffee-950">
                      Quotation Request Form
                    </h2>

                    <p className="text-coffee-500 text-sm">
                      All fields marked with * are required. Your RFQ reference number is generated automatically after submission.
                    </p>
                  </div>
                </div>

                <form
                  className="space-y-8"
                  onSubmit={handleSubmit}
                >

                  {/* =================================================
                      CONTACT INFORMATION
                  ================================================= */}

                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-widest text-primary-700 mb-4 flex items-center gap-2">
                      <User className="w-4 h-4" />
                      Contact Information
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                      {/* Full Name */}
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
                          placeholder="John Doe"
                          className="w-full px-5 py-3.5 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 placeholder-coffee-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all"
                        />
                      </div>

                      {/* Company */}
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
                          placeholder="Your Company Ltd."
                          className="w-full px-5 py-3.5 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 placeholder-coffee-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all"
                        />
                      </div>

                      {/* Email */}
                      <div>
                        <label className="block text-sm font-semibold text-coffee-800 mb-2 flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5" />
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
                          placeholder="john@company.com"
                          className="w-full px-5 py-3.5 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 placeholder-coffee-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all"
                        />
                      </div>

                      {/* Phone */}
                      <div>
                        <label className="block text-sm font-semibold text-coffee-800 mb-2 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5" />
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

                      {/* Country */}
                      <div>
                        <label className="block text-sm font-semibold text-coffee-800 mb-2 flex items-center gap-1.5">
                          <Globe2 className="w-3.5 h-3.5" />
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
                            Select country
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

                      {/* Destination Port */}
                      <div>
                        <label className="block text-sm font-semibold text-coffee-800 mb-2">
                          Destination Port
                        </label>

                        <input
                          type="text"
                          value={form.destination_port}
                          onChange={(e) =>
                            updateField(
                              'destination_port',
                              e.target.value
                            )
                          }
                          placeholder="e.g. New York, Hamburg, Yokohama"
                          className="w-full px-5 py-3.5 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 placeholder-coffee-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* =================================================
                      COFFEE REQUIREMENTS
                  ================================================= */}

                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-widest text-primary-700 mb-4 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Coffee Requirements
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                      {/* Product */}
                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-coffee-800 mb-2">
                          Product of Interest
                        </label>

                        <input
                          type="text"
                          value={form.product}
                          onChange={(e) =>
                            updateField(
                              'product',
                              e.target.value
                            )
                          }
                          placeholder="Specific coffee name or product code (optional)"
                          className="w-full px-5 py-3.5 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 placeholder-coffee-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all"
                        />
                      </div>

                      {/* Region */}
                      <div>
                        <label className="block text-sm font-semibold text-coffee-800 mb-2 flex items-center gap-1.5">
                          <Leaf className="w-3.5 h-3.5" />
                          Region
                        </label>

                        <select
                          value={form.region}
                          onChange={(e) =>
                            updateField(
                              'region',
                              e.target.value
                            )
                          }
                          className="w-full px-5 py-3.5 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all"
                        >
                          <option value="">
                            Select region
                          </option>

                          {regions.map((region) => (
                            <option
                              key={region}
                              value={region}
                            >
                              {region}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Grade */}
                      <div>
                        <label className="block text-sm font-semibold text-coffee-800 mb-2 flex items-center gap-1.5">
                          <Award className="w-3.5 h-3.5" />
                          Grade
                        </label>

                        <select
                          value={form.grade}
                          onChange={(e) =>
                            updateField(
                              'grade',
                              e.target.value
                            )
                          }
                          className="w-full px-5 py-3.5 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all"
                        >
                          <option value="">
                            Select grade
                          </option>

                          {grades.map((grade) => (
                            <option
                              key={grade}
                              value={grade}
                            >
                              {grade}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Processing */}
                      <div>
                        <label className="block text-sm font-semibold text-coffee-800 mb-2">
                          Processing Method
                        </label>

                        <select
                          value={form.processing}
                          onChange={(e) =>
                            updateField(
                              'processing',
                              e.target.value
                            )
                          }
                          className="w-full px-5 py-3.5 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all"
                        >
                          <option value="">
                            Select processing method
                          </option>

                          {processes.map((process) => (
                            <option
                              key={process}
                              value={process}
                            >
                              {process}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Quantity */}
                      <div>
                        <label className="block text-sm font-semibold text-coffee-800 mb-2">
                          Quantity (kg)
                        </label>

                        <input
                          type="number"
                          min={0}
                          value={form.quantity}
                          onChange={(e) =>
                            updateField(
                              'quantity',
                              e.target.value
                            )
                          }
                          placeholder="e.g. 12000"
                          className="w-full px-5 py-3.5 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 placeholder-coffee-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all"
                        />
                      </div>

                      {/* Packaging */}
                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-coffee-800 mb-2">
                          Packaging Preference
                        </label>

                        <select
                          value={form.packaging}
                          onChange={(e) =>
                            updateField(
                              'packaging',
                              e.target.value
                            )
                          }
                          className="w-full px-5 py-3.5 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all"
                        >
                          <option value="">
                            Select packaging
                          </option>

                          {packaging.map((item) => (
                            <option
                              key={item}
                              value={item}
                            >
                              {item}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Certifications */}
                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-coffee-800 mb-2">
                          Required Certifications
                        </label>

                        <div className="flex flex-wrap gap-2">
                          {certifications.map((cert) => (
                            <label
                              key={cert}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-cream-100 border border-coffee-200 hover:border-primary-400 cursor-pointer transition-colors text-sm text-coffee-800"
                            >
                              <input
                                type="checkbox"
                                className="accent-primary-600"
                                checked={form.certifications.includes(
                                  cert
                                )}
                                onChange={(e) => {
                                  const next =
                                    e.target.checked
                                      ? [
                                          ...form.certifications,
                                          cert,
                                        ]
                                      : form.certifications.filter(
                                          (c) => c !== cert
                                        )

                                  updateField(
                                    'certifications',
                                    next
                                  )
                                }}
                              />

                              {cert}
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Target Shipment */}
                      <div className="md:col-span-2">
                        <label className="block text-sm font-semibold text-coffee-800 mb-2 flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5" />
                          Target Shipment Period
                        </label>

                        <input
                          type="text"
                          value={form.target_shipment}
                          onChange={(e) =>
                            updateField(
                              'target_shipment',
                              e.target.value
                            )
                          }
                          placeholder="e.g. Q2 2026, May-June 2026, ASAP"
                          className="w-full px-5 py-3.5 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 placeholder-coffee-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* =================================================
                      ADDITIONAL INFORMATION
                  ================================================= */}

                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-widest text-primary-700 mb-4 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Additional Information
                    </h3>

                    <textarea
                      rows={6}
                      value={form.message}
                      onChange={(e) =>
                        updateField(
                          'message',
                          e.target.value
                        )
                      }
                      placeholder="Tell us more about your program: roast profile, target cup, current suppliers, incoterm preference, and any other details."
                      className="w-full px-5 py-4 rounded-xl border-2 border-coffee-200 bg-cream-50 text-coffee-900 placeholder-coffee-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-600 transition-all resize-none"
                    />
                  </div>

                  {/* =================================================
                      SUBMIT / SUCCESS
                  ================================================= */}

                  <div>
                    {error && (
                      <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
                        {error}
                      </div>
                    )}

                    {successRef ? (
                      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
                        <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-3" />

                        <p className="text-green-700 font-semibold text-lg">
                          Your quotation request has been submitted successfully.
                        </p>

                        {isNewCustomer && customerCode && (
                          <p className="mt-3 text-sm text-green-700">
                            A new customer account has been created for your company.
                          </p>
                        )}

                        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                          <div className="rounded-xl border border-green-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-green-600 font-semibold">
                              RFQ Reference
                            </p>
                            <p className="mt-1 text-xl font-bold text-green-900">
                              {successRef}
                            </p>
                          </div>

                          {customerCode && (
                            <div className="rounded-xl border border-green-200 bg-white p-4">
                              <p className="text-xs uppercase tracking-wider text-green-600 font-semibold">
                                Your Customer Code
                              </p>
                              <p className="mt-1 text-xl font-bold text-green-900">
                                {customerCode}
                              </p>
                            </div>
                          )}
                        </div>

                        <p className="mt-5 text-sm text-green-700">
                          Please keep these reference numbers for future communication with Waka Coffee.
                        </p>

                        <button
                          type="button"
                          onClick={() => {
                            setSuccessRef(null)
                            setCustomerCode(null)
                            setIsNewCustomer(false)
                          }}
                          className="mt-5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold px-6 py-3 transition-all"
                        >
                          Submit Another Request
                        </button>
                      </div>
                    ) : (
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full inline-flex items-center justify-center gap-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold px-8 py-4.5 rounded-2xl shadow-xl shadow-primary-600/25 hover:shadow-2xl hover:shadow-primary-600/30 transition-all text-lg disabled:opacity-60"
                      >
                        <Send className="w-5 h-5" />

                        {loading
                          ? 'Submitting...'
                          : 'Submit Quotation Request'}
                      </button>
                    )}
                  </div>

                  <p className="text-sm text-coffee-500 text-center">
                    By submitting this form you agree to our privacy policy. You will receive a confirmation with your RFQ reference number.
                  </p>
                </form>
              </div>
            </div>

            {/* =====================================================
                RIGHT SIDEBAR
            ===================================================== */}

            <div className="space-y-6">

              {/* What Happens Next */}
              <div className="bg-primary-600 rounded-[2rem] p-8 text-white shadow-xl shadow-primary-600/20">
                <h3 className="text-xl font-bold font-serif mb-4">
                  What Happens Next?
                </h3>

                <ol className="space-y-4">
                  {[
                    'We receive your RFQ and automatically generate a unique reference number.',
                    'Our sales team reviews your request and prepares a detailed quotation.',
                    'You receive pricing, lot availability, lead time, and logistics options.',
                    'Counter samples, cupping notes, and origin cards are dispatched on request.',
                    'Once confirmed, we finalize the contract and schedule your shipment.',
                  ].map((step, i) => (
                    <li
                      key={i}
                      className="flex gap-3"
                    >
                      <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center font-bold flex-shrink-0">
                        {i + 1}
                      </div>

                      <span className="text-primary-50 leading-relaxed">
                        {step}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Direct Contact */}
              <div className="bg-white rounded-[2rem] p-8 border border-coffee-100 shadow-lg">
                <h3 className="text-xl font-bold font-serif text-coffee-950 mb-6">
                  Prefer Direct Contact?
                </h3>

                <ul className="space-y-4 text-sm">

                  <li className="flex items-start gap-3">
                    <Mail className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" />

                    <div>
                      <p className="font-semibold text-coffee-900">
                        Sales Team
                      </p>

                      <a
                        href="mailto:sales@wakacoffee.com"
                        className="text-primary-700 hover:underline"
                      >
                        sales@wakacoffee.com
                      </a>
                    </div>
                  </li>

                  <li className="flex items-start gap-3">
                    <Phone className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" />

                    <div>
                      <p className="font-semibold text-coffee-900">
                        Phone / WhatsApp
                      </p>

                      <p className="text-coffee-600">
                        +251 911 123 456
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start gap-3">
                    <Globe2 className="w-4 h-4 text-primary-600 mt-0.5 flex-shrink-0" />

                    <div>
                      <p className="font-semibold text-coffee-900">
                        Business Hours
                      </p>

                      <p className="text-coffee-600">
                        Mon–Fri: 8am–6pm EAT
                      </p>

                      <p className="text-coffee-600">
                        Sat: 9am–2pm EAT
                      </p>
                    </div>
                  </li>

                </ul>

                <Link
                  to="/request-sample"
                  className="mt-6 flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-cream-100 hover:bg-cream-200 font-semibold text-coffee-900 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  First Request Samples
                </Link>
              </div>

              {/* No Obligation */}
              <div className="bg-gradient-to-br from-coffee-900 to-coffee-950 rounded-[2rem] p-8 text-white">
                <CheckCircle2 className="w-8 h-8 text-primary-400 mb-4" />

                <h3 className="text-xl font-bold font-serif mb-3">
                  No Obligation
                </h3>

                <p className="text-coffee-200 leading-relaxed text-sm">
                  A quotation request is non-binding. Pricing is valid for 14 days from date of issue. Contracts are signed only after both parties agree to terms.
                </p>
              </div>

            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default RequestQuote

