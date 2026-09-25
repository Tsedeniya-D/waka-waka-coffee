import PageHeader from '../components/PageHeader'
import { Link } from 'react-router-dom'
import servicesIMG from '../../images/services.jpg'
import {
  Leaf,
  Ship,
  ClipboardCheck,
  Truck,
  Users,
  FileText,
  BarChart3,
  BadgeCheck,
  ArrowRight,
} from 'lucide-react'

const Services = () => {
  const services = [
    {
      icon: Leaf,
      title: 'Direct Farm Sourcing',
      description:
        'Coffee sourced directly from partner farms and cooperatives in Sidama, Yirgacheffe, Guji, Harrar, Limu, Jimma, and Kaffa with full origin traceability.',
    },
    {
      icon: ClipboardCheck,
      title: 'Quality Assurance & Cupping',
      description:
        'Professional cupping, defect analysis, screen grading, moisture analysis, and quality reports by certified Q-Graders available on request.',
    },
    {
      icon: BadgeCheck,
      title: 'Certification Handling',
      description:
        'Support for Organic, Fair Trade, UTZ, Rainforest Alliance, and specialty certified coffees. Document management per shipment.',
    },
    {
      icon: FileText,
      title: 'Custom Blends & Profiles',
      description:
        'Custom house blend development to your specification, profile matching for existing coffees, and micro-lot selection for roaster programs.',
    },
    {
      icon: Truck,
      title: 'Packaging & Private Label',
      description:
        'Standard 60kg jute, GrainPro liners, vacuum packs, or custom client-branded packaging. Private label green coffee programs available.',
    },
    {
      icon: Ship,
      title: 'Export & Logistics',
      description:
        'FCL and LCL ocean freight, air freight for samples or urgent orders, export documentation, and shipment tracking through delivery.',
    },
    {
      icon: Users,
      title: 'Sample Program',
      description:
        'Roasted or green sample dispatch with pre-shipment approval samples. Sample requests fulfilled within 3-5 business days.',
    },
    {
      icon: BarChart3,
      title: 'Market Intelligence',
      description:
        'Harvest updates, crop forecasts, regional availability notes, and market position updates for buyers with active contracts.',
    },
  ]

  return (
    <div>
      <PageHeader
        eyebrow="Our Services"
        title="Complete Coffee Export Solutions"
        description="From sourcing and quality control to export logistics, we offer end-to-end services designed for specialty coffee roasters, importers, and distributors worldwide."
        image={servicesIMG}
        overlay='green'
      />

      <section className="py-20 bg-cream-50">
        <div className="container-x">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {services.map(({ icon: Icon, title, description }, index) => (
              <div
                key={title}
                className="group bg-white p-8 rounded-3xl shadow-sm hover:shadow-xl transition-all duration-300 border border-coffee-100 hover:border-primary-200"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="w-14 h-14 rounded-2xl bg-primary-50 group-hover:bg-primary-600 flex items-center justify-center mb-6 transition-colors">
                  <Icon className="w-7 h-7 text-primary-600 group-hover:text-white transition-colors" />
                </div>
                <h3 className="text-xl font-bold text-coffee-950 mb-3">{title}</h3>
                <p className="text-coffee-600 text-sm leading-relaxed">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container-x">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-primary-600 font-medium mb-4 uppercase tracking-widest text-sm">
                B2B Buyer Program
              </p>
              <h2 className="text-3xl md:text-4xl font-bold font-serif text-coffee-950 mb-6">
                Built for Coffee Professionals
              </h2>
              <p className="text-coffee-600 text-lg leading-relaxed mb-8">
                We work with specialty roasters, QSR chains, distributors, and private
                label programs of every size. Our account team provides dedicated
                support from first sample through repeat contracts.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  'Dedicated account manager per buyer',
                  'Contract and spot offerings',
                  'Forward contracts for harvest planning',
                  'Container consolidation programs',
                  'Quarterly cupping sets by subscription',
                  'Pre-shipment approval samples',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-coffee-700">
                    <span className="w-2 h-2 rounded-full bg-primary-500" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                to="/request-quote"
                className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold px-8 py-4 rounded-2xl shadow-lg shadow-primary-600/25 transition-all"
              >
                Open a Buyer Account
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Services
