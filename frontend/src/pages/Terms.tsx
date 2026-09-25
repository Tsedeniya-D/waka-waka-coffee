import PageHeader from '../components/PageHeader'
import { FileText, Scale, ShoppingBag, Truck, Award, ShieldAlert } from 'lucide-react'
import { SITE_CONFIG } from '../constants'
import exportBgImg from '../../images/export/exportBG.jpg'

const Terms = () => {
  const lastUpdated = 'September 14, 2026'

  const sections = [
    {
      icon: Scale,
      title: '1. Commercial Agreement & Scope',
      content: `These Terms of Service ("Terms") govern the access to our commercial services, product quotations, sample requests, and export transactions executed by Waka Coffee Export PLC ("Waka Coffee", "we", or "us"). By submitting a quote request, sample application, or entering into an export contract with us, you ("Buyer", "Client", or "User") agree to be bound by these Terms.`,
    },
    {
      icon: ShoppingBag,
      title: '2. Quotations, Pricing & Contracts',
      content: `• Price Quotes: All commercial quotations issued by Waka Coffee are expressed in US Dollars (USD) unless explicitly agreed otherwise. Quotes remain valid for the timeframe indicated on the quotation sheet (typically 7 to 14 days due to market fluctuations).
• Contract Binding: Formal orders are finalized upon the execution of a written Sales Contract signed by authorized representatives of both parties and receipt of agreed financial instruments (e.g., Letter of Credit, advance telegraphic transfer).
• ECX & Market Conditions: Prices reflect raw green coffee market rates, origin grade standards, and local processing parameters at time of quotation.`,
    },
    {
      icon: Award,
      title: '3. Samples & Pre-Shipment Approval',
      content: `• Evaluation Samples: Sample sets (green or roasted) dispatched for buyer evaluation are representative of lot profiles.
• Pre-Shipment Samples (PSS): For commercial contract fulfillments, pre-shipment approval samples are drawn directly from processed export batches. Written buyer approval of PSS confirms acceptance of the green bean physical attributes and cup score profile prior to container loading.`,
    },
    {
      icon: Truck,
      title: '4. Packaging, Incoterms & Export Logistics',
      content: `• Incoterms 2020: Deliveries are governed by ICC Incoterms 2020 as specified in the Sales Contract (e.g., FOB Djibouti, FCA Addis Ababa, CIF destination port).
• Packaging: Standard packaging consists of food-grade 60kg jute bags with optional GrainPro liners or vacuum bags per buyer specification.
• Shipping Timelines: Transit schedules and shipment loading dates are estimates dependent on shipping line availability, Djibouti port operations, and customs processing.`,
    },
    {
      icon: ShieldAlert,
      title: '5. Quality Assurance & Claims Procedure',
      content: `• Inspection Standards: Coffees are inspected and graded in accordance with the Ethiopian Commodity Exchange (ECX) and Ethiopian Coffee & Tea Authority regulations.
• Claim Submission: Any claims regarding quality divergence or weight shortage must be submitted in writing within fifteen (15) calendar days of cargo arrival at the destination port, supported by an independent official surveyor report (e.g., SGS or equivalent).
• Limitation of Liability: Liability for proven non-conformity is strictly limited to replacement of defective goods or credit adjustment as stipulated in the formal contract.`,
    },
    {
      icon: FileText,
      title: '6. Governing Law & Dispute Resolution',
      content: `• Governing Law: These Terms and all underlying export contracts shall be governed by and construed in accordance with the laws of the Federal Democratic Republic of Ethiopia.
• Arbitration: Any disputes arising out of or in connection with commercial contracts that cannot be resolved amicably shall be submitted to binding arbitration under the rules of the Addis Ababa Chamber of Commerce and Sectoral Associations (AACCSA) Arbitration Center.`,
    },
  ]

  return (
    <div>
      <PageHeader
        eyebrow="Commercial Terms"
        title="Terms of Service"
        description="General commercial terms, export conditions, and contractual obligations of Waka Coffee Export PLC."
        image={exportBgImg}
        overlay="brown"
      />

      <section className="py-16 bg-cream-50">
        <div className="container-x max-w-5xl">
          {/* TOP INFO BOX */}
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-coffee-100 mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <span className="inline-block px-3.5 py-1 rounded-full bg-coffee-100 text-coffee-800 text-xs font-semibold uppercase tracking-wider mb-2">
                Export Terms
              </span>
              <h2 className="text-2xl font-bold text-coffee-950">Standard Commercial Conditions</h2>
              <p className="text-coffee-600 text-sm mt-1">
                Last Revised: {lastUpdated}
              </p>
            </div>
            <div className="flex items-center gap-3 text-coffee-700 bg-coffee-50 px-5 py-3 rounded-2xl border border-coffee-100">
              <Scale className="w-5 h-5 text-coffee-700 shrink-0" />
              <span className="text-xs font-medium">Governed by Ethiopian Trade Regulations & Incoterms 2020</span>
            </div>
          </div>

          {/* SECTIONS */}
          <div className="space-y-8">
            {sections.map((section, idx) => {
              const Icon = section.icon
              return (
                <div
                  key={idx}
                  className="bg-white rounded-3xl p-8 md:p-10 shadow-sm border border-coffee-100 transition-all duration-200 hover:shadow-md"
                >
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-12 h-12 rounded-2xl bg-coffee-50 border border-coffee-100 flex items-center justify-center text-coffee-800 shrink-0">
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

          {/* FOOTER BANNER */}
          <div className="mt-12 text-center p-8 bg-[#2b1a0f] text-white rounded-3xl">
            <h4 className="text-xl font-bold font-serif mb-2">Need Custom Contract Terms?</h4>
            <p className="text-coffee-200 text-sm mb-6 max-w-xl mx-auto">
              Our trade desk handles custom buyer specifications, long-term supply agreements, and specific tender requirements.
            </p>
            <a
              href={`mailto:${SITE_CONFIG.email.sales}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-xl transition-colors shadow-lg"
            >
              Contact Sales & Trade Desk
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Terms
