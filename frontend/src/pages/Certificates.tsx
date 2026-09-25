import PageHeader from '../components/PageHeader'
import {
  Award,
  FileBadge,
  ShieldCheck,
  BadgeCheck,
  Calendar,
  Download,
  Lock,
} from 'lucide-react'
import { Link } from 'react-router-dom'

const Certificates = () => {
  const certificates = [
    {
      id: 1,
      title: 'Organic Certification',
      type: 'certificate',
      typeLabel: 'Certificate',
      icon: Award,
      description: 'Organic certification for Ethiopian origin coffee lots.',
      documentNumber: 'Available on request',
      issueDate: 'Per shipment',
      expiryDate: 'Per shipment',
      isPublic: true,
      color: 'bg-primary-100 text-primary-700',
    },
    {
      id: 2,
      title: 'Fair Trade Certification',
      type: 'certificate',
      typeLabel: 'Certificate',
      icon: ShieldCheck,
      description: 'Fair trade certification for partner cooperatives.',
      documentNumber: 'Available on request',
      issueDate: 'Per shipment',
      expiryDate: 'Per shipment',
      isPublic: true,
      color: 'bg-blue-100 text-blue-700',
    },
    {
      id: 3,
      title: 'Rainforest Alliance',
      type: 'certificate',
      typeLabel: 'Certificate',
      icon: BadgeCheck,
      description: 'Sustainability certification per applicable lots.',
      documentNumber: 'Available on request',
      issueDate: 'Per shipment',
      expiryDate: 'Per shipment',
      isPublic: true,
      color: 'bg-emerald-100 text-emerald-700',
    },
    {
      id: 4,
      title: 'Export License',
      type: 'license',
      typeLabel: 'License',
      icon: FileBadge,
      description: 'Ministry of Trade coffee export license, Ethiopia.',
      documentNumber: 'Available on request',
      issueDate: 'Per year',
      expiryDate: 'Per year',
      isPublic: false,
      color: 'bg-amber-100 text-amber-700',
    },
    {
      id: 5,
      title: 'Phytosanitary Certificate',
      type: 'quality_document',
      typeLabel: 'Quality Document',
      icon: ShieldCheck,
      description: 'Standard plant health certificate per export shipment.',
      documentNumber: 'Per shipment',
      issueDate: 'Per shipment',
      expiryDate: 'Per shipment',
      isPublic: false,
      color: 'bg-coffee-100 text-coffee-700',
    },
    {
      id: 6,
      title: 'Quality / Cupping Report',
      type: 'quality_document',
      typeLabel: 'Quality Report',
      icon: Award,
      description: 'Q-Grader cupping report and quality analysis per lot.',
      documentNumber: 'Per lot',
      issueDate: 'Per lot',
      expiryDate: 'Per lot',
      isPublic: false,
      color: 'bg-purple-100 text-purple-700',
    },
    {
      id: 7,
      title: 'ECX Certificate',
      type: 'compliance_document',
      typeLabel: 'Compliance',
      icon: FileBadge,
      description: 'Ethiopian Commodity Exchange certificates where applicable.',
      documentNumber: 'Per shipment',
      issueDate: 'Per shipment',
      expiryDate: 'Per shipment',
      isPublic: false,
      color: 'bg-indigo-100 text-indigo-700',
    },
    {
      id: 8,
      title: 'Food Safety / HACCP',
      type: 'compliance_document',
      typeLabel: 'Compliance',
      icon: ShieldCheck,
      description: 'Food safety and handling compliance documents.',
      documentNumber: 'Available on request',
      issueDate: 'Available on request',
      expiryDate: 'Available on request',
      isPublic: false,
      color: 'bg-rose-100 text-rose-700',
    },
  ]

  return (
    <div>
      <PageHeader
        eyebrow="Certificates"
        title="Certifications, Licenses & Compliance"
        description="We maintain all required export and quality certifications. Certificate and document copies are provided to buyers on request and per active shipment."
      />

      <section className="py-20 bg-cream-50">
        <div className="container-x">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {certificates.map(
              ({
                id,
                title,
                typeLabel,
                icon: Icon,
                description,
                documentNumber,
                issueDate,
                expiryDate,
                isPublic,
                color,
              }) => (
                <div
                  key={id}
                  className="bg-white rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all duration-300 border border-coffee-100 group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className={`w-14 h-14 rounded-2xl ${color} flex items-center justify-center group-hover:scale-105 transition-transform`}
                    >
                      <Icon className="w-7 h-7" />
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${color}`}
                    >
                      {typeLabel}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-coffee-950 mb-2">{title}</h3>
                  <p className="text-coffee-600 text-sm mb-4 leading-relaxed">
                    {description}
                  </p>
                  <div className="space-y-2 text-sm mb-6 pb-6 border-b border-coffee-100">
                    <div className="flex justify-between">
                      <span className="text-coffee-500">Doc. Number</span>
                      <span className="text-coffee-800 font-medium">{documentNumber}</span>
                    </div>
                    <div className="flex items-center gap-2 justify-between">
                      <span className="text-coffee-500 inline-flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Issued
                      </span>
                      <span className="text-coffee-800 font-medium">{issueDate}</span>
                    </div>
                    <div className="flex items-center gap-2 justify-between">
                      <span className="text-coffee-500">Valid Until</span>
                      <span className="text-coffee-800 font-medium">{expiryDate}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Link
                      to="/contact"
                      className="text-sm font-medium text-primary-700 hover:text-primary-600 inline-flex items-center gap-1.5"
                    >
                      {isPublic ? (
                        <>
                          <Download className="w-4 h-4" />
                          View Document
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4" />
                          Request Copy
                        </>
                      )}
                    </Link>
                  </div>
                </div>
              )
            )}
          </div>

          <div className="mt-16 p-8 md:p-12 rounded-[2rem] bg-coffee-950 text-white">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
              <div>
                <h3 className="text-2xl md:text-3xl font-bold font-serif mb-4">
                  Need Specific Documentation?
                </h3>
                <p className="text-coffee-300 leading-relaxed">
                  Additional destination-specific certificates, import
                  documentation, and compliance documents can be arranged per
                  buyer request. Contact our export team for your specific
                  country requirements.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row gap-4 md:justify-end">
                <Link
                  to="/contact"
                  className="px-6 py-3.5 rounded-2xl bg-primary-600 hover:bg-primary-500 text-white font-semibold transition-colors text-center shadow-lg shadow-primary-600/30"
                >
                  Contact Export Team
                </Link>
                <Link
                  to="/request-quote"
                  className="px-6 py-3.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold transition-colors text-center"
                >
                  Start Your Inquiry
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Certificates
