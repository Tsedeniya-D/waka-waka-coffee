import PageHeader from '../components/PageHeader'
import { Shield, Lock, Eye, FileText, Server, Mail } from 'lucide-react'
import { SITE_CONFIG } from '../constants'
import qualityControlImg from '../../images/export/qualityControl.jpg'

const Privacy = () => {
  const lastUpdated = 'September 14, 2026'

  const sections = [
    {
      icon: Shield,
      title: '1. Introduction & Overview',
      content: `Waka Coffee Export PLC ("Waka Coffee", "we", "our", or "us") is committed to protecting your privacy and personal data. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website, submit requests for quotations or samples, or interact with our export services.`,
    },
    {
      icon: Eye,
      title: '2. Information We Collect',
      content: `We collect information that you voluntarily provide to us when inquiring about our coffee products or services:
      
• Contact Information: Full name, company name, corporate email address, telephone number, WhatsApp contact, and physical delivery/business address.
• Commercial Inquiry Details: Coffee origin preferences (Sidama, Yirgacheffe, Guji, etc.), grade requirements, target volume (LCL/FCL), preferred Incoterms, and destination port.
• Technical Data: IP address, browser type, device information, and site interaction metrics collected via cookies for operational performance and analytics.`,
    },
    {
      icon: Server,
      title: '3. How We Use Your Information',
      content: `We process your personal and corporate data strictly for legitimate business purposes:

• Processing Quotations & Sample Orders: Preparing commercial offers, shipping sample sets, and issuing formal proforma invoices.
• Export & Trade Documentation: Fulfilling phytosanitary certificates, certificates of origin, bills of lading, and customs declarations required by Ethiopian and international trade authorities.
• Customer Communication: Responding to trade inquiries, providing shipment tracking updates, and delivering harvest notices.
• Compliance & Security: Preventing fraud, ensuring security of our web portal, and complying with legal obligations under Ethiopian export laws.`,
    },
    {
      icon: Lock,
      title: '4. Information Sharing & Third Parties',
      content: `We do not sell, rent, or trade your personal information. We share relevant data only with trusted partners necessary to execute trade operations:

• Logistics & Freight Forwarders: Ocean carriers, air cargo lines, and shipping agents for freight bookings and consignment tracking.
• Trade & Regulatory Authorities: Ethiopian Coffee & Tea Authority, Ethiopian Customs Commission, and quality certification bodies as legally mandated.
• Service Providers: Secure cloud hosting providers, IT services, and communication platforms bound by strict confidentiality agreements.`,
    },
    {
      icon: FileText,
      title: '5. Data Retention & Security',
      content: `We implement robust technical and organizational security measures to protect your data against unauthorized access, alteration, or disclosure. Commercial contracts and export transaction records are retained in compliance with statutory Ethiopian commercial record-keeping requirements (typically 7 to 10 years). Inquiry data is retained only as long as necessary to fulfill business interactions.`,
    },
    {
      icon: Mail,
      title: '6. Your Rights & Contact Us',
      content: `Depending on your jurisdiction, you have rights regarding your personal data, including the right to request access, correction, or deletion of your information stored with us.
      
If you have any questions, concerns, or requests regarding this Privacy Policy, please contact our Data Protection Coordinator:

• Company: ${SITE_CONFIG.fullName}
• Email: ${SITE_CONFIG.email.info} / ${SITE_CONFIG.email.sales}
• Phone: ${SITE_CONFIG.phone.primary}
• Address: ${SITE_CONFIG.address.street}, ${SITE_CONFIG.address.city}, ${SITE_CONFIG.address.country}`,
    },
  ]

  return (
    <div>
      <PageHeader
        eyebrow="Legal & Privacy"
        title="Privacy Policy"
        description="How Waka Coffee Export PLC collects, uses, and safeguards your corporate and personal information."
        image={qualityControlImg}
        overlay="green"
      />

      <section className="py-16 bg-cream-50">
        <div className="container-x max-w-5xl">
          {/* TOP INFO BOX */}
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-coffee-100 mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="inline-block px-3.5 py-1 rounded-full bg-primary-100 text-primary-800 text-xs font-semibold uppercase tracking-wider mb-2">
                Official Policy
              </span>
              <h2 className="text-2xl font-bold text-coffee-950">Data Protection Standards</h2>
              <p className="text-coffee-600 text-sm mt-1">
                Effective Date: {lastUpdated}
              </p>
            </div>
            <div className="flex items-center gap-3 text-coffee-700 bg-coffee-50 px-5 py-3 rounded-2xl border border-coffee-100">
              <Shield className="w-5 h-5 text-primary-600 shrink-0" />
              <span className="text-xs font-medium">Fully Compliant Commercial Data Handling</span>
            </div>
          </div>

          {/* POLICY SECTIONS */}
          <div className="space-y-8">
            {sections.map((section, idx) => {
              const Icon = section.icon
              return (
                <div
                  key={idx}
                  className="bg-white rounded-3xl p-8 md:p-10 shadow-sm border border-coffee-100 transition-all duration-200 hover:shadow-md"
                >
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-12 h-12 rounded-2xl bg-primary-50 border border-primary-100 flex items-center justify-center text-primary-700 shrink-0">
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl md:text-2xl font-bold text-coffee-950 font-serif">
                      {section.title}
                    </h3>
                  </div>

                  <div className="text-coffee-800 leading-relaxed whitespace-pre-line text-base md:text-lg">
                    {section.content}
                  </div>
                </div>
              )
            })}
          </div>

          {/* BOTTOM SUMMARY FOOTNOTE */}
          <div className="mt-12 text-center p-8 bg-coffee-900 text-white rounded-3xl">
            <h4 className="text-xl font-bold font-serif mb-2">Have Questions About Commercial Privacy?</h4>
            <p className="text-coffee-200 text-sm mb-6 max-w-xl mx-auto">
              Our export specialists are available to assist with any data protection or trade documentation questions.
            </p>
            <a
              href={`mailto:${SITE_CONFIG.email.info}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-xl transition-colors shadow-lg"
            >
              Contact Legal & Privacy Team
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Privacy
