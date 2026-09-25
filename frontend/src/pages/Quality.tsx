import PageHeader from '../components/PageHeader'
import { Link } from 'react-router-dom'
import {
  ShieldCheck,
  MapPin,
  Search,
  ClipboardList,
  Users,
  FileCheck,
  ArrowRight,
  Award,
  Eye,
} from 'lucide-react'

const Quality = () => {
  return (
    <div>
      <PageHeader
        eyebrow="Quality & Traceability"
        title="Uncompromising Quality, Complete Traceability"
        description="Our commitment to quality begins at the farm and continues through every processing, grading, and export step. Every lot we ship is fully traceable to origin."
        overlay="brown"
      />

      <section className="py-20 bg-cream-50">
        <div className="container-x">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
            {[
              {
                icon: ShieldCheck,
                title: 'Multi-Point Quality Control',
                points: [
                  'Cherry inspection at delivery',
                  'Mucilage and wash quality check',
                  'Parchment screen & density',
                  'Green bean defect grading',
                  'Roasted profile & cupping',
                  'Moisture & water activity',
                ],
              },
              {
                icon: MapPin,
                title: 'Full Origin Traceability',
                points: [
                  'Farm / cooperative / kebele level',
                  'Washing station and processing date',
                  'Altitude, variety, harvest date',
                  'Processing method & fermentation',
                  'Drying method and duration',
                  'Lottable and cupping score',
                ],
              },
              {
                icon: Search,
                title: 'Sample & Lot Tracking',
                points: [
                  'Pre-shipment approval samples',
                  'Counter sample retention',
                  'Unique lot reference per bag',
                  'Container load photos',
                  'Seal numbers & container ID',
                  'Document pack per shipment',
                ],
              },
            ].map(({ icon: Icon, title, points }) => (
              <div
                key={title}
                className="bg-white p-8 rounded-3xl shadow-lg border border-coffee-100"
              >
                <div className="w-14 h-14 rounded-2xl bg-primary-600 flex items-center justify-center mb-6 shadow-lg shadow-primary-600/20">
                  <Icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-coffee-950 mb-6">{title}</h3>
                <ul className="space-y-3">
                  {points.map((p) => (
                    <li key={p} className="flex items-start gap-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary-500 mt-2.5" />
                      <span className="text-coffee-700">{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="bg-gradient-to-br from-coffee-950 via-coffee-900 to-primary-900 rounded-[2.5rem] p-10 md:p-16 text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
            <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <p className="text-primary-300 font-medium mb-4 uppercase tracking-widest text-sm">
                  Transparency You Can Trust
                </p>
                <h2 className="text-3xl md:text-4xl font-bold font-serif mb-6 leading-tight">
                  Every Lot Comes With Its Own Story
                </h2>
                <p className="text-coffee-200 text-lg mb-8 leading-relaxed">
                  Request a sample pack to see the level of detail we provide for
                  every coffee: origin card, process notes, farmer story, altitude,
                  variety, cup score, and recommended roast profile.
                </p>
                <Link
                  to="/request-sample"
                  className="inline-flex items-center gap-2 bg-white text-coffee-950 hover:bg-primary-100 font-semibold px-8 py-4 rounded-2xl shadow-xl transition-colors"
                >
                  Request Sample Pack
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { icon: Users, stat: '100%', label: 'Directly Sourced' },
                  { icon: ClipboardList, stat: 'Q-Grade', label: 'Certified Cupping' },
                  { icon: FileCheck, stat: 'Full', label: 'Documentation per Lot' },
                  { icon: Eye, stat: 'Full', label: 'Traceability to Farm' },
                ].map(({ icon: Icon, stat, label }) => (
                  <div
                    key={label}
                    className="bg-white/10 backdrop-blur p-6 rounded-2xl border border-white/10"
                  >
                    <Icon className="w-6 h-6 text-primary-400 mb-3" />
                    <div className="text-3xl font-bold font-serif mb-1">{stat}</div>
                    <div className="text-coffee-300 text-sm">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container-x">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <div className="w-14 h-14 rounded-2xl bg-primary-100 flex items-center justify-center mx-auto mb-6">
              <Award className="w-7 h-7 text-primary-700" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold font-serif text-coffee-950 mb-6">
              Certifications & Compliance
            </h2>
            <p className="text-coffee-600 text-lg leading-relaxed">
              Certifications and document numbers are available on request and per
              shipment. Browse our certificates page for more details.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              'Organic',
              'Fair Trade',
              'Rainforest Alliance',
              'UTZ / 4C',
              'Ethiopian ECX',
              'Phytosanitary',
              'Q-Certified',
              'HACCP / Food Safety',
            ].map((cert) => (
              <div
                key={cert}
                className="p-6 rounded-2xl bg-cream-50 border border-coffee-100 text-center hover:border-primary-300 hover:bg-primary-50/50 transition-all"
              >
                <p className="font-semibold text-coffee-900">{cert}</p>
                <p className="text-xs text-primary-600 mt-1">On Request</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link
              to="/certificates"
              className="inline-flex items-center gap-2 text-primary-700 font-semibold hover:text-primary-600 transition-colors"
            >
              View Certificates Page
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Quality
