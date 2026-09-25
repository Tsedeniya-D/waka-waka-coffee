import { Link } from 'react-router-dom'
import * as Icons from 'lucide-react'
import LogoImg from '../../images/logo.png'
import { SITE_CONFIG, FOOTER_QUICK_LINKS} from '../constants'
import { useState } from 'react'
import { useCreateNewsletterSubscription } from '../queries'
import { errorMessage } from '../lib/api'
import { newsletterSchema } from '../lib/schemas'

const NEWSLETTER_MESSAGES = {
  subscribed: 'Subscribed. Thank you!',
  resubscribed: 'Subscribed. Welcome back!',
  already_subscribed: "You're already subscribed.",
} as const

const Footer = () => {
  const [newsletterEmail, setNewsletterEmail] = useState('')
  const [newsletterResult, setNewsletterResult] = useState<{ ok: boolean; message: string } | null>(null)
  const subscribe = useCreateNewsletterSubscription()

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault()
    setNewsletterResult(null)

    const parsed = newsletterSchema.safeParse({ email: newsletterEmail, source: 'footer' })
    if (!parsed.success) {
      setNewsletterResult({ ok: false, message: parsed.error.issues[0]?.message || 'Enter a valid email address.' })
      return
    }

    try {
      const res = await subscribe.mutateAsync({ email: parsed.data.email, source: parsed.data.source })
      setNewsletterResult({ ok: true, message: NEWSLETTER_MESSAGES[res?.status] ?? NEWSLETTER_MESSAGES.subscribed })
      setNewsletterEmail('')
    } catch (err: unknown) {
      setNewsletterResult({ ok: false, message: errorMessage(err, 'Could not subscribe. Please try again.') })
    }
  }

  return (
    <footer className="bg-[#2b1a0f] text-white pt-20 pb-8 relative overflow-hidden">
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 left-0 w-96 h-96 bg-primary-500 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-coffee-600 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
      </div>

      <div className="container-x relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
          <div className="lg:col-span-1">
            <Link to="/" className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-xl bg-transparent flex items-center justify-center shadow-lg overflow-hidden">
                <img src={LogoImg} alt="Waka Coffee" className="w-10 h-10 object-contain" />
              </div>
              <div>
                <h3 className="text-3xl font-bold font-serif">Waka Coffee</h3>
                <p className="text-sm tracking-widest uppercase text-white">Export</p>
              </div>
            </Link>
            <p className="text-white mb-6 leading-relaxed">{SITE_CONFIG.description}</p>
            <div className="flex gap-3">
              {[
                { Icon: Icons.ThumbsUp, href: SITE_CONFIG.social.facebook, label: 'Facebook' },
                { Icon: Icons.Camera, href: SITE_CONFIG.social.instagram, label: 'Instagram' },
                { Icon: Icons.Users, href: SITE_CONFIG.social.linkedin, label: 'LinkedIn' },
                { Icon: Icons.Bird, href: SITE_CONFIG.social.twitter, label: 'Twitter' },
                { Icon: Icons.Play, href: SITE_CONFIG.social.youtube, label: 'YouTube' },
              ].map(({ Icon, href, label }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition-all duration-200 text-white hover:text-white"
                >
                  {Icon ? <Icon className="w-4 h-4" /> : null}
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <span className="w-8 h-0.5 bg-primary-500 rounded-full" />
              Quick Links
            </h4>
            <ul className="space-y-3">
              {FOOTER_QUICK_LINKS.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                      className="text-white hover:text-white/90 transition-colors inline-flex items-center gap-2 group"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-coffee-600 group-hover:bg-primary-500 transition-colors" />
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

         <div>
            <h4 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <span className="w-8 h-0.5 bg-primary-500 rounded-full" />
              Get in Touch
            </h4>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-transparent flex items-center justify-center flex-shrink-0">
                  {Icons.MapPin ? <Icons.MapPin className="w-4 h-4 text-white" /> : null}
                </div>
                <div className="text-white">
                  <p className="text-white">{SITE_CONFIG.address.street}</p>
                  <p>
                    {SITE_CONFIG.address.city}, {SITE_CONFIG.address.country}
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-transparent flex items-center justify-center flex-shrink-0">
                  {Icons.Mail ? <Icons.Mail className="w-4 h-4 text-white" /> : null}
                </div>
                <div>
                  <a
                    href={`mailto:${SITE_CONFIG.email.info}`}
                    className="text-white hover:text-white/90 transition-colors block"
                  >
                    {SITE_CONFIG.email.info}
                  </a>
                  <a
                    href={`mailto:${SITE_CONFIG.email.sales}`}
                    className="text-white hover:text-white/90 transition-colors block text-sm"
                  >
                    {SITE_CONFIG.email.sales}
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-transparent flex items-center justify-center flex-shrink-0">
                  {Icons.Phone ? <Icons.Phone className="w-4 h-4 text-white" /> : null}
                </div>
                <a
                  href={`tel:${SITE_CONFIG.phone.primary}`}
                  className="text-white hover:text-white/90 transition-colors"
                >
                  {SITE_CONFIG.phone.primary}
                </a>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-transparent flex items-center justify-center flex-shrink-0">
                  {Icons.MessageCircle ? <Icons.MessageCircle className="w-4 h-4 text-white" /> : null}
                </div>
                <a
                  href={`https://wa.me/${SITE_CONFIG.phone.whatsapp.replace(/[\s+()-]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white hover:text-white/90 transition-colors"
                >
                  WhatsApp: {SITE_CONFIG.phone.whatsapp}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-16 p-8 rounded-3xl bg-gradient-to-r from-primary-900/60 via-coffee-800/40 to-coffee-800/40 border border-white/10 backdrop-blur">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div>
              <h5 className="font-semibold text-white mb-2">Business Hours</h5>
              <p className="text-white text-sm">{SITE_CONFIG.businessHours.weekdays}</p>
              <p className="text-white text-sm mt-1">{SITE_CONFIG.businessHours.saturday}</p>
              <p className="text-white text-sm mt-1">{SITE_CONFIG.businessHours.sunday}</p>
            </div>
            <div>
              <h5 className="font-semibold text-white mb-2">Certificates</h5>
              <p className="text-white text-sm">
                All our products are certified and sourced ethically. View our certificates page for details.
              </p>
              <Link to="/certificates" className="text-white hover:text-white/90 text-sm font-medium mt-2 inline-block">
                View Certificates →
              </Link>
            </div>
            <div>
              <h5 className="font-semibold text-white mb-2">Request a Quote</h5>
              <p className="text-white text-sm">
                Tell us your requirements and we will prepare a detailed quotation within 24 hours.
              </p>
              <Link to="/request-quote" className="text-white hover:text-white/90 text-sm font-medium mt-2 inline-block">
                Start Inquiry →
              </Link>
            </div>
            <div>
              <h5 className="font-semibold text-white mb-2">Newsletter</h5>
              <p className="text-white text-sm mb-3">
                Subscribe for harvest updates, origin stories, and new offerings.
              </p>
              <form className="flex gap-2" onSubmit={handleSubscribe} noValidate>
                <input
                  type="email"
                  required
                  aria-label="Email address"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  disabled={subscribe.isPending}
                  placeholder="your@email.com"
                  className="flex-1 px-4 py-2.5 rounded-xl bg-white/10 border border-white/10 text-white placeholder-white/70 focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 text-sm"
                />
                <button
                  type="submit"
                  disabled={subscribe.isPending}
                  className="px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium text-sm transition-colors disabled:opacity-60"
                >
                  {subscribe.isPending ? 'Joining…' : 'Join'}
                </button>
              </form>
              {newsletterResult && (
                <p
                  role="status"
                  className={`text-sm mt-2 ${newsletterResult.ok ? 'text-green-300' : 'text-red-300'}`}
                >
                  {newsletterResult.message}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-white text-sm">
            © {new Date().getFullYear()} {SITE_CONFIG.name}. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-sm">
            <Link to="/privacy" className="text-white hover:text-white/90 transition-colors">
              Privacy Policy
            </Link>
            <span className="text-white/40">•</span>
            <Link to="/terms" className="text-white hover:text-white/90 transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
