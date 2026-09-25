import PageHeader from '../components/PageHeader'
import { Link, useParams, useNavigate } from 'react-router-dom'
import {
  Mountain,
  Droplets,
  Award,
  Leaf,
  Sun,
  Sparkles,
  Palette,
  Thermometer,
  ShieldCheck,
  FileDown,
  MessageSquare,
  Send,
  ChevronRight,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react'
import { AVAILABILITY_LABELS, COFFEE_REGIONS } from '../constants'

const ProductDetail = () => {
  const { slug } = useParams()
  const navigate = useNavigate()

  const coffeeName = slug
    ? slug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : 'Sidama Grade 1'

  const defaultImage =
    'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=premium%20ethiopian%20green%20coffee%20beans%20jute%20bag%20professional%20product%20photo%20no%20people&image_size=square_hd'

  const gallery = Array.from({ length: 6 }, (_, i) => ({
    id: i,
    url: `https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodeURIComponent(`ethiopian ${coffeeName.toLowerCase()} coffee ${['beans jute bag', 'close up macro', 'drying beds farm', 'farm landscape', 'cupping evaluation', 'packaging warehouse'][i]} premium photography no people`)}&image_size=square_hd`,
  }))

  const relatedImages = [
    {
      name: 'Yirgacheffe Heirloom',
      region: 'Yirgacheffe',
      flavors: 'Jasmine, Bergamot, Black Tea',
      image:
        'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=ethiopian%20yirgacheffe%20coffee%20beans%20close%20up%20with%20jasmine%20flowers%20no%20people&image_size=square',
    },
    {
      name: 'Guji Natural',
      region: 'Guji',
      flavors: 'Berry, Wine, Chocolate',
      image:
        'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=natural%20processed%20ethiopian%20guji%20coffee%20beans%20with%20fresh%20berries%20no%20people&image_size=square',
    },
    {
      name: 'Harrar Longberry',
      region: 'Harrar',
      flavors: 'Blueberry, Wine, Spice',
      image:
        'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=ethiopian%20harrar%20longberry%20coffee%20beans%20with%20tropical%20fruits%20and%20spices%20no%20people&image_size=square',
    },
  ]

  const regionMatch = COFFEE_REGIONS.find(
    (r) => coffeeName.toLowerCase().includes(r.name.toLowerCase()) || slug?.toLowerCase().includes(r.name.toLowerCase())
  )
  const region = regionMatch || COFFEE_REGIONS[0]

  const availability = AVAILABILITY_LABELS.available

  return (
    <div>
      <PageHeader
        eyebrow="Product Details"
        title={coffeeName}
        description={`Single-origin Ethiopian ${region.name} specialty product, graded and cupped by Waka Coffee quality team.`}
      />

      <section className="py-16 bg-cream-50">
        <div className="container-x">
          <Link
            to="/products"
            className="inline-flex items-center gap-2 text-primary-700 font-medium hover:text-primary-600 mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Products
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <div className="aspect-square rounded-[2rem] overflow-hidden shadow-2xl mb-6 bg-white">
                <img
                  src={defaultImage}
                  alt={coffeeName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="grid grid-cols-6 gap-3">
                {gallery.map((g, i) => (
                  <button
                    key={g.id}
                    onClick={() => navigate(`/products/${slug}#gallery`)}
                    className={`aspect-square rounded-xl overflow-hidden border-2 transition-all ${
                      i === 0
                        ? 'border-primary-500 ring-2 ring-primary-500/30'
                        : 'border-transparent hover:border-primary-300'
                    }`}
                  >
                    <img
                      src={g.url}
                      alt={`${coffeeName} view ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:sticky lg:top-28">
              <div className="flex items-center gap-3 mb-4">
                <span className={`px-4 py-1.5 rounded-full text-sm font-semibold ${availability.color}`}>
                  {availability.label}
                </span>
                <span className="px-4 py-1.5 rounded-full text-sm font-semibold bg-coffee-100 text-coffee-700">
                  {region.name}
                </span>
                <span className="px-4 py-1.5 rounded-full text-sm font-semibold bg-primary-50 text-primary-700">
                  Specialty Grade
                </span>
              </div>

              <h1 className="text-4xl md:text-5xl font-bold font-serif text-coffee-950 mb-4 leading-tight">
                {coffeeName}
              </h1>

              <p className="text-coffee-600 text-lg leading-relaxed mb-8">
                {region.description} This lot is carefully processed to preserve the
                signature character of {region.name} and shipped with complete
                traceability and documentation.
              </p>

              <div className="grid grid-cols-2 gap-3 mb-8">
                {[
                  { icon: Mountain, label: 'Altitude', value: region.altitude },
                  { icon: Droplets, label: 'Process', value: 'Washed / Available on request' },
                  { icon: Award, label: 'Grade', value: 'G1 — G2 (per lot)' },
                  { icon: Leaf, label: 'Variety', value: 'Ethiopian Heirloom' },
                  { icon: Sun, label: 'Harvest', value: 'Oct – Feb (Ethiopian)' },
                  { icon: ShieldCheck, label: 'Certifications', value: 'Available on request' },
                ].map(({ icon: Icon, label, value }) => (
                  <div
                    key={label}
                    className="p-4 rounded-2xl bg-white border border-coffee-100"
                  >
                    <div className="flex items-center gap-2 text-primary-600 text-xs font-semibold uppercase tracking-wide mb-1">
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </div>
                    <div className="text-coffee-900 font-medium leading-tight">
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-gradient-to-br from-coffee-900 to-coffee-950 rounded-[2rem] p-8 text-white mb-6">
                <h3 className="text-lg font-semibold mb-5 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary-400" />
                  Cup Profile
                </h3>
                <div className="space-y-4">
                  {[
                    { label: 'Flavor Notes', value: region.flavors, icon: Palette },
                    { label: 'Aroma', value: 'Floral, Fruity, Sweet', icon: Sparkles },
                    { label: 'Body', value: 'Medium / Available on request', icon: Droplets },
                    { label: 'Acidity', value: 'Bright / Available on request', icon: Thermometer },
                    { label: 'Aftertaste', value: 'Clean, Lingering Sweetness', icon: Award },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="flex justify-between gap-4 border-b border-white/10 pb-3 last:border-0 last:pb-0">
                      <div className="flex items-center gap-2 text-coffee-300 text-sm flex-shrink-0">
                        <Icon className="w-4 h-4 text-primary-400" />
                        {label}
                      </div>
                      <div className="text-white font-medium text-right">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                {[
                  ['Screen Size', 'Available on request'],
                  ['Moisture', '≤11.5% (export standard)'],
                  ['Packaging', 'Jute / GrainPro / Custom'],
                  ['Traceability', 'To washing station / farm'],
                ].map(([k, v]) => (
                  <div key={k} className="p-4 rounded-xl bg-white border border-coffee-100">
                    <div className="text-coffee-500 text-xs uppercase tracking-wide mb-1">{k}</div>
                    <div className="text-coffee-900 font-medium">{v}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <Link
                  to="/request-quote"
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold px-6 py-4 rounded-2xl shadow-xl shadow-primary-600/25 hover:shadow-2xl transition-all text-lg"
                >
                  <MessageSquare className="w-5 h-5" />
                  Request Quote
                </Link>
                <Link
                  to="/request-sample"
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-white hover:bg-cream-100 text-coffee-900 font-semibold px-6 py-4 rounded-2xl border-2 border-coffee-200 hover:border-primary-400 transition-all text-lg"
                >
                  <Send className="w-5 h-5" />
                  Request Sample
                </Link>
              </div>

              <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-cream-100 text-sm">
                <div className="flex items-center gap-2 text-coffee-600">
                  <FileDown className="w-4 h-4 text-primary-600" />
                  Specification Sheet & Lot Documents
                </div>
                <Link to="/contact" className="text-primary-700 hover:text-primary-600 font-semibold">
                  Available on request
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container-x">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2">
              <h2 className="text-3xl md:text-4xl font-bold font-serif text-coffee-950 mb-6">
                About This Coffee
              </h2>
              <div className="space-y-6 text-coffee-700 leading-relaxed text-lg">
                <p>
                  {coffeeName} represents the classic character of {region.name} —
                  one of Ethiopia's most celebrated and distinctive growing areas.
                  Every lot is sourced from our network of partner smallholder
                  farms and washing stations and processed under close quality
                  supervision.
                </p>
                <p>
                  Grown at {region.altitude}, the slow ripening in thin high-altitude
                  air produces intense, layered flavors. The signature cup shows
                  notes of {region.flavors.toLowerCase()}, with a clean finish and
                  pleasant sweetness.
                </p>
                <p>
                  This coffee is suitable for single-origin espresso, pour-over,
                  filter programs, and signature blends. We ship in new food-grade
                  jute bags, with optional GrainPro liners or custom private label
                  packaging on request.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12">
                {[
                  'Full lot traceability to origin',
                  'Q-Grader cupping and report',
                  'Pre-shipment approval samples',
                  'Counter sample retention on every lot',
                  'Moisture and screen size verification',
                  'Phyto, origin, and full export docs',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 p-4 rounded-2xl bg-cream-50">
                    <CheckCircle2 className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
                    <span className="text-coffee-800 font-medium">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="aspect-[3/4] rounded-[2rem] overflow-hidden shadow-xl">
                <img
                  src={`https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=ethiopian%20coffee%20farm%20${encodeURIComponent(region.name.toLowerCase())}%20landscape%20drying%20beds%20mountains%20golden%20hour%20documentary%20no%20people&image_size=portrait_4_3`}
                  alt={`${region.name} origin`}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="mt-6 p-6 rounded-3xl bg-primary-50 border border-primary-200">
                <h4 className="font-bold text-coffee-950 mb-2">Origin: {region.name}</h4>
                <p className="text-sm text-coffee-600 leading-relaxed">
                  {region.description}
                </p>
                <Link
                  to={`/origins#${region.name.toLowerCase()}`}
                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary-700 hover:text-primary-600"
                >
                  Learn more about {region.name}
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-cream-50">
        <div className="container-x">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="text-primary-600 font-medium mb-3 uppercase tracking-widest text-sm">
                You Might Also Like
              </p>
              <h2 className="text-3xl md:text-4xl font-bold font-serif text-coffee-950">
                Explore Other Ethiopian Origins
              </h2>
            </div>
            <Link
              to="/products"
              className="hidden md:inline-flex items-center gap-2 text-primary-700 font-semibold hover:text-primary-600"
            >
              View All Coffees <ChevronRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {relatedImages.map((product) => (
              <Link
                key={product.name}
                to={`/products/${product.name.toLowerCase().replace(/\s+/g, '-')}`}
                className="group bg-white rounded-3xl overflow-hidden shadow-lg hover:shadow-2xl transition-all border border-coffee-100"
              >
                <div className="aspect-square overflow-hidden">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                </div>
                <div className="p-6">
                  <div className="text-xs font-semibold text-primary-600 uppercase tracking-wider mb-2">
                    {product.region}
                  </div>
                  <h3 className="text-xl font-bold text-coffee-950 mb-2 group-hover:text-primary-700 transition-colors">
                    {product.name}
                  </h3>
                  <p className="text-coffee-600 text-sm">{product.flavors}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export default ProductDetail
