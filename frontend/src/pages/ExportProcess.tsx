import PageHeader from '../components/PageHeader'
import { EXPORT_STEPS } from '../constants'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import exportBgImg from '../../images/export/exportBG.jpg'
import sourcingImg from '../../images/export/sourcing.jpg'
import processingImg from '../../images/export/proccessing.jpg'
import qualityControlImg from '../../images/export/qualityControl.jpg'
import gradingImg from '../../images/export/grading.jpg'
import packagingImg from '../../images/export/packaging.png'
import exportImg from '../../images/export/export.jpg'
import shippingImg from '../../images/export/shipping.jpg'

const stepImages: Record<number, string> = {
  1: sourcingImg,
  2: processingImg,
  3: qualityControlImg,
  4: gradingImg,
  5: packagingImg,
  6: exportBgImg,
  7: exportImg,
  8: shippingImg,
}

const ExportProcess = () => {
  return (
    <div>
      <PageHeader
        eyebrow="Export Process"
        title="From Farm to Port, Delivered Worldwide"
        description="Our 8-step export workflow ensures every lot of coffee is carefully sourced, processed, quality controlled, and shipped with full traceability and documentation."
        image={exportBgImg}
        overlay="dark"
      />

      <section className="py-20 bg-cream-50">
        <div className="container-x">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold font-serif text-coffee-950 mb-6">
              The Waka Coffee Export Journey
            </h2>
            <p className="text-coffee-600 text-lg leading-relaxed">
              Every consignment we export follows our carefully designed quality
              assurance workflow. Transparency is built into every step.
            </p>
          </div>

          <div className="relative">
            <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary-200 via-primary-500 to-primary-200" />

            <div className="space-y-16">
              {EXPORT_STEPS.map((step, index) => (
                <div
                  key={step.step}
                  className={`grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center ${
                    index % 2 === 1 ? 'lg:!flex-row-reverse' : ''
                  }`}
                >
                  <div className={`${index % 2 === 1 ? 'lg:order-2' : ''}`}>
                    <div className="bg-white p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-shadow border border-coffee-100">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-16 h-16 rounded-2xl bg-primary-600 text-white text-3xl font-bold font-serif flex items-center justify-center shadow-lg shadow-primary-600/25">
                          {step.step}
                        </div>
                        <div>
                          <h3 className="text-2xl font-bold text-coffee-950">
                            {step.title}
                          </h3>
                          <p className="text-primary-600 text-sm font-medium tracking-wide">
                            Step {step.step} of {EXPORT_STEPS.length}
                          </p>
                        </div>
                      </div>
                      <p className="text-coffee-700 leading-relaxed">
                        {step.description}
                      </p>
                    </div>
                  </div>

                  <div className={`${index % 2 === 1 ? 'lg:order-1' : ''}`}>
                    <div className="aspect-[4/3] rounded-3xl overflow-hidden shadow-xl">
                      <img
                        src={stepImages[step.step] || exportImg}
                        alt={step.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-coffee-950 text-white">
        <div className="container-x">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-primary-400 font-medium mb-4 uppercase tracking-widest text-sm">
                Logistics & Documentation
              </p>
              <h2 className="text-3xl md:text-4xl font-bold font-serif mb-6">
                End-to-End Export Coordination
              </h2>
              <p className="text-coffee-300 text-lg mb-8 leading-relaxed">
                We handle the complete export process so you can focus on what matters
                — receiving quality coffee. All standard export documentation is
                prepared by our experienced team.
              </p>
              <ul className="space-y-4">
                {[
                  'Phytosanitary certificate from Ministry of Agriculture',
                  'Certificate of Origin',
                  'Bill of Lading / Air Waybill',
                  'Commercial Invoice & Packing List',
                  'ECX / QCI quality certificate (where applicable)',
                  'Fumigation certificate (per destination)',
                  'Phyto re-export (per destination)',
                ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-primary-500 mt-0.5 flex-shrink-0" />
                      <span className="text-coffee-200">{item}</span>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="bg-white/5 backdrop-blur p-8 rounded-3xl border border-white/10">
              <h3 className="text-2xl font-bold font-serif mb-6">
                Ready to Discuss Your Shipment?
              </h3>
              <p className="text-coffee-300 mb-8">
                Share your destination port, required quantity, target shipment window,
                and preferred Incoterms. We will prepare a detailed quotation with
                logistics options.
              </p>
              <div className="space-y-3">
                <Link
                  to="/request-quote"
                  className="w-full inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-500 text-white font-semibold px-6 py-4 rounded-2xl transition-colors shadow-lg shadow-primary-600/30"
                >
                  Request a Quotation
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/contact"
                  className="w-full inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-6 py-4 rounded-2xl transition-colors border border-white/20"
                >
                  Talk to Our Export Team
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default ExportProcess
