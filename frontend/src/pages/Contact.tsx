import { useState } from 'react'
import ContactBG from '../../images/contactBG.jpg'
import { useCreateContactMessage } from '../queries'
import { errorMessage } from '../lib/api'
import { contactMessageSchema } from '../lib/schemas'

const Contact = () => {
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    company: '',
    country: '',
    message: '',
  })

  const createMessage = useCreateContactMessage()
  const loading = createMessage.isPending
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const updateField = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setError(null)
  setSuccess(null)

  const parsed = contactMessageSchema.safeParse(form)

  if (!parsed.success) {
    setError(
      parsed.error.issues[0]?.message || 'Please check the form fields.'
    )
    return
  }

  try {
    await createMessage.mutateAsync({ ...parsed.data })

    setSuccess('Message sent. We will get back to you shortly.')

    setForm({
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
      company: '',
      country: '',
      message: '',
    })
  } catch (err: unknown) {
    // API messages are user-facing (validation, 429 rate limit, network errors).
    setError(errorMessage(err, 'Failed to send message. Please try again.'))
  }
}
  return (
    <div>
      {/* Page Header with Ethiopian Coffee Background */}
      <section className="relative py-24 text-white overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src={ContactBG} 
            alt="Ethiopian Coffee" 
            className="w-full h-full object-cover animate-slow-zoom"
          />
          <div className="absolute inset-0 bg-primary-900/75"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-primary-300 font-medium mb-3 uppercase tracking-wider">Get In Touch</p>
          <h1 className="text-4xl md:text-6xl font-bold mb-4">Contact Us</h1>
          <p className="text-xl text-gray-200 max-w-2xl mx-auto">Ready to start your journey with premium Ethiopian coffee? We'd love to hear from you!</p>
        </div>
      </section>

      {/* Contact Section */}
     <section className="relative py-20 lg:py-28 overflow-hidden text-white">
      {/* background */}
      <div className="absolute inset-0">
        <img
          src={ContactBG}
          alt="coffee bean background"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-primary-900/65"></div>
      </div>

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/75" />

  {/* Content */}
  <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">

      {/* ================= LEFT: CONTACT FORM ================= */}
      <div>

        <p className="text-primary-400 font-medium mb-4 uppercase tracking-[0.2em] text-sm">
          Get In Touch
        </p>

        <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-tight mb-6">
          Visit Us or
          <br />
          Get in Touch!
        </h2>

        <p className="text-gray-300 text-base sm:text-lg leading-relaxed max-w-xl mb-10">
          We’re always happy to hear from you. Whether you want to
          place a wholesale order, buy retail coffee, or ask about
          origins, roasts, or availability, our team is ready to help.
        </p>

        <form id="contact-form" className="space-y-7" onSubmit={handleSubmit}>

          {/* Full Name */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Full Name
            </label>
            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                name="first_name"
                value={form.first_name}
                onChange={(e) => updateField('first_name', e.target.value)}
                placeholder="First name"
                className="w-full bg-transparent border-0 border-b border-white/30 px-0 py-3 text-white placeholder:text-gray-400 focus:border-primary-400 focus:ring-0 outline-none transition"
              />
              <input
                type="text"
                name="last_name"
                value={form.last_name}
                onChange={(e) => updateField('last_name', e.target.value)}
                placeholder="Last name"
                className="w-full bg-transparent border-0 border-b border-white/30 px-0 py-3 text-white placeholder:text-gray-400 focus:border-primary-400 focus:ring-0 outline-none transition"
              />
            </div>
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">

            <div>
              <label className="block text-sm text-gray-300 mb-2">
                Phone Number
              </label>

              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="+251 ..."
                className="w-full bg-transparent border-0 border-b border-white/30 px-0 py-3 text-white placeholder:text-gray-400 focus:border-primary-400 focus:ring-0 outline-none transition"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-2">
                Email
              </label>

              <input
                type="email"
                name="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-transparent border-0 border-b border-white/30 px-0 py-3 text-white placeholder:text-gray-400 focus:border-primary-400 focus:ring-0 outline-none transition"
              />
            </div>

          </div>

          {/* Country */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Country
            </label>

            <input
              type="text"
              name="country"
              value={form.country}
              onChange={(e) => updateField('country', e.target.value)}
              placeholder="Your country"
              className="w-full bg-transparent border-0 border-b border-white/30 px-0 py-3 text-white placeholder:text-gray-400 focus:border-primary-400 focus:ring-0 outline-none transition"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">
              Message
            </label>

            <textarea
              name="message"
              rows={5}
              value={form.message}
              onChange={(e) => updateField('message', e.target.value)}
              placeholder="Tell us how we can help..."
              className="w-full bg-transparent border-0 border-b border-white/30 px-0 py-3 text-white placeholder:text-gray-400 focus:border-primary-400 focus:ring-0 outline-none transition resize-none"
            />
          </div>

          {/* Button */}
          <div>
            {error && <p className="text-sm text-red-300 mb-2">{error}</p>}
            {success && <p className="text-sm text-green-300 mb-2">{success}</p>}
            <button
              type="submit"
              disabled={loading}
              className="bg-primary-600 disabled:opacity-60 hover:bg-primary-700 text-white px-8 py-4 rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              {loading ? 'Sending…' : 'Send Message'}
            </button>
          </div>

        </form>

      </div>


      {/* ================= RIGHT: CONTACT INFORMATION ================= */}
      <div className="lg:pt-8">

        <p className="text-primary-400 font-medium mb-4 uppercase tracking-[0.2em] text-sm">
          Contact Information
        </p>

        <h2 className="font-serif text-4xl sm:text-5xl mb-10">
          Waka Coffee Export
        </h2>


        {/* Address */}
        <div className="flex items-start gap-5 mb-8">

          <div className="w-11 h-11 rounded-full border border-white/30
            flex items-center justify-center flex-shrink-0">
            <span className="text-lg">⌖</span>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-1">
              Address
            </h3>

            <p className="text-gray-300 leading-relaxed">
              Addis Ababa, Ethiopia
            </p>
          </div>

        </div>


        {/* Email */}
        <div className="flex items-start gap-5 mb-8">

          <div className="w-11 h-11 rounded-full border border-white/30
            flex items-center justify-center flex-shrink-0">
            <span className="text-lg">✉</span>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-1">
              Email
            </h3>

            <p className="text-gray-300">
              info@wakacoffee.com
            </p>

            <p className="text-gray-300">
              sales@wakacoffee.com
            </p>
          </div>

        </div>


        {/* Phone */}
        <div className="flex items-start gap-5 mb-10">

          <div className="w-11 h-11 rounded-full border border-white/30
            flex items-center justify-center flex-shrink-0">
            <span className="text-lg">☎</span>
          </div>

          <div>
            <h3 className="font-semibold text-lg mb-1">
              Phone
            </h3>

            <p className="text-gray-300">
              +251 911 123 456
            </p>

            <p className="text-gray-300">
              +251 911 654 321
            </p>
          </div>

        </div>


        {/* Google Map removed for now; add the map embed back here if needed. */}

      </div>

    </div>

  </div>

</section>
    </div>
  )
}

export default Contact
