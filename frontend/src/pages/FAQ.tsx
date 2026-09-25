import PageHeader from '../components/PageHeader'
import { useState } from 'react'
import { ChevronDown, MessageCircle, Search } from 'lucide-react'
import { Link } from 'react-router-dom'
import { classNames } from '../utils'

const FAQ = () => {
  const [openId, setOpenId] = useState<number | null>(1)
  const [search, setSearch] = useState('')

  const faqCategories = [
    { id: 'general', name: 'General' },
    { id: 'buying', name: 'Buying & Quotes' },
    { id: 'shipping', name: 'Shipping & Export' },
    { id: 'quality', name: 'Quality & Samples' },
  ]

  const faqs = [
    {
      id: 1,
      category: 'general',
      question: 'Where is Waka Coffee based?',
      answer:
        'Waka Coffee is based in Addis Ababa, Ethiopia. We source coffee directly from partner farms and cooperatives in Sidama, Yirgacheffe, Guji, Harrar, Limu, Jimma, and Kaffa regions. Our export team manages logistics and documentation locally.',
    },
    {
      id: 2,
      category: 'buying',
      question: 'What is your minimum order quantity (MOQ)?',
      answer:
        'Our standard MOQ information is available on request. In general we support both spot and contract programs. Contact our sales team with your requirements and we will recommend the best option for your program size, whether pallet, LCL, or FCL volume.',
    },
    {
      id: 3,
      category: 'buying',
      question: 'How do I request a quotation?',
      answer:
        'Use our online Request Quote form, email sales@wakacoffee.com, or call our sales team. We respond to all formal inquiries within one business day with a detailed quotation including pricing, availability, packaging, and logistics options.',
    },
    {
      id: 4,
      category: 'quality',
      question: 'Can I get samples before ordering?',
      answer:
        'Yes. We offer both green and roasted sample sets. Use our Request Sample form or contact sales with the coffees you would like to evaluate. Sample dispatch is normally within 3-5 business days. We offer pre-shipment approval samples on all confirmed orders.',
    },
    {
      id: 5,
      category: 'quality',
      question: 'What quality guarantees do you provide?',
      answer:
        'Every shipment is backed by our pre-shipment cupping approval, counter sample retention, and full lot traceability. We provide all required quality and export documentation per shipment and work closely with buyers on any quality resolution.',
    },
    {
      id: 6,
      category: 'shipping',
      question: 'What Incoterms do you offer?',
      answer:
        'Available Incoterms options, freight arrangements, and shipping times are confirmed per quotation and destination. Typical options include FOB Djibouti, CIF, and FCA per buyer request. Contact our export team for options specific to your country.',
    },
    {
      id: 7,
      category: 'shipping',
      question: 'What ports do you ship from?',
      answer:
        'Specific port and routing information is provided per quotation. Export from Ethiopia generally routes through Djibouti for ocean freight and Addis Ababa for air freight. Full logistics details are confirmed in each formal quotation.',
    },
    {
      id: 8,
      category: 'shipping',
      question: 'What export documents are included?',
      answer:
        'Standard export document packs include Commercial Invoice, Packing List, Bill of Lading or Air Waybill, Phytosanitary Certificate, and Certificate of Origin. Additional destination-specific documents available on request.',
    },
    {
      id: 9,
      category: 'buying',
      question: 'Do you offer contract / forward sales?',
      answer:
        'Yes. We offer forward contracts tied to specific harvest windows and lots for buyers planning programs several months ahead. Contact sales with your target volumes, origins, and shipping windows for detailed proposals.',
    },
    {
      id: 10,
      category: 'general',
      question: 'Do you offer private label or custom packaging?',
      answer:
        'Yes. Private label and custom-branded packaging options are available for green coffee programs. This includes custom bag printing, GrainPro liners, lot labels, and bespoke documentation. MOQs apply and are confirmed on request.',
    },
    {
      id: 11,
      category: 'quality',
      question: 'What certifications do you handle?',
      answer:
        'We can provide Organic, Fair Trade, Rainforest Alliance, and other certifications on lots where applicable. Certifications and lot eligibility are confirmed on request and per quotation.',
    },
    {
      id: 12,
      category: 'general',
      question: 'I am a small roaster — can I work with Waka Coffee?',
      answer:
        'Absolutely. We work with roaster programs of every size. Share your target volume, origin, roast profile, and timeline and we will structure the best option. LCL, pallet, groupage, and consolidation programs are all available depending on season.',
    },
  ]

  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(search.toLowerCase()) ||
      faq.answer.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <PageHeader
        eyebrow="FAQ"
        title="Frequently Asked Questions"
        description="Answers to common questions about sourcing Ethiopian coffee from Waka Coffee — from ordering and samples to export logistics."
      />

      <section className="py-10 bg-cream-50 border-b border-coffee-100">
        <div className="container-x">
          <div className="max-w-2xl mx-auto relative">
            <Search className="w-5 h-5 text-coffee-400 absolute left-5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions..."
              className="w-full pl-14 pr-6 py-4 rounded-2xl bg-white border border-coffee-200 text-coffee-800 placeholder-coffee-400 focus:outline-none focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 shadow-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2 justify-center mt-6">
            {faqCategories.map((cat) => (
              <button
                key={cat.id}
                className="px-5 py-2 rounded-full text-sm font-medium bg-white text-coffee-700 hover:bg-coffee-100 border border-coffee-200 transition-colors"
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-cream-50">
        <div className="container-x">
          <div className="max-w-3xl mx-auto space-y-4">
            {filteredFaqs.length === 0 && (
              <div className="text-center py-16 text-coffee-500">
                <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                No questions match your search.
              </div>
            )}
            {filteredFaqs.map((faq) => {
              const isOpen = openId === faq.id
              return (
                <div
                  key={faq.id}
                  className={classNames(
                    'bg-white rounded-2xl border overflow-hidden transition-all',
                    isOpen
                      ? 'border-primary-200 shadow-lg'
                      : 'border-coffee-100 hover:border-coffee-200 shadow-sm hover:shadow-md'
                  )}
                >
                  <button
                    onClick={() => setOpenId(isOpen ? null : faq.id)}
                    className="w-full flex items-start md:items-center justify-between text-left gap-4 p-6 md:p-8"
                  >
                    <h3
                      className={classNames(
                        'font-semibold text-lg md:text-xl leading-tight transition-colors',
                        isOpen ? 'text-primary-700' : 'text-coffee-950'
                      )}
                    >
                      {faq.question}
                    </h3>
                    <ChevronDown
                      className={classNames(
                        'w-5 h-5 flex-shrink-0 mt-1 md:mt-0 transition-transform duration-300',
                        isOpen ? 'rotate-180 text-primary-600' : 'text-coffee-400'
                      )}
                    />
                  </button>
                  <div
                    className={classNames(
                      'grid transition-all duration-300',
                      isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="px-6 md:px-8 pb-8 border-t border-coffee-100 pt-6">
                        <p className="text-coffee-600 leading-relaxed">{faq.answer}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-20 max-w-3xl mx-auto p-8 md:p-12 rounded-[2rem] bg-gradient-to-br from-primary-600 to-primary-800 text-white text-center">
            <MessageCircle className="w-12 h-12 mx-auto mb-4 text-primary-200" />
            <h3 className="text-2xl md:text-3xl font-bold font-serif mb-4">
              Still Have Questions?
            </h3>
            <p className="text-primary-100 text-lg mb-8 max-w-xl mx-auto">
              Our sales team is available Monday through Friday and will respond to
              your inquiry within one business day.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/contact"
                className="px-8 py-4 rounded-2xl bg-white text-primary-800 hover:bg-primary-50 font-semibold shadow-xl transition-colors"
              >
                Contact Us
              </Link>
              <Link
                to="/request-quote"
                className="px-8 py-4 rounded-2xl bg-primary-900 hover:bg-primary-950 text-white font-semibold border border-white/20 transition-colors"
              >
                Request a Quote
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default FAQ
