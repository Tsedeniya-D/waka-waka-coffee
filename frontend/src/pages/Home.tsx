import { Link } from 'react-router-dom'
import { useState } from 'react'

const Home = () => {
  const features = [
    { title: 'Premium Quality', description: 'Sourced from the finest Ethiopian coffee farms' },
    { title: 'Direct Farmers', description: 'Working directly with local farmers for fair trade' },
    { title: 'International Standards', description: 'Certified and meeting global quality standards' },
    { title: 'Fast Export', description: 'Efficient logistics for timely delivery worldwide' },
    { title: 'Sustainable Farming', description: 'Eco-friendly and sustainable agricultural practices' },
    { title: 'Experienced Team', description: 'Professional team with years of coffee export expertise' },
  ]

  const products = [
    { name: 'Sidama Grade 1', region: 'Sidama', flavor: 'Floral, Citrus, Chocolate', image: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=premium%20ethiopian%20sidama%20coffee%20beans%20in%20jute%20bag%20with%20floral%20notes&image_size=square' },
    { name: 'Yirgacheffe Heirloom', region: 'Yirgacheffe', flavor: 'Jasmine, Bergamot, Black Tea', image: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=ethiopian%20yirgacheffe%20coffee%20beans%20close%20up%20with%20jasmine%20flowers&image_size=square' },
    { name: 'Guji Natural', region: 'Guji', flavor: 'Berry, Wine, Chocolate', image: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=natural%20processed%20ethiopian%20guji%20coffee%20beans%20with%20berries&image_size=square' },
  ]

  // Multiple image options for hero (no people)
  const heroImageOptions1 = [
    'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=close%20up%20of%20ethiopian%20coffee%20cherries%20drying%20on%20raised%20beds%20sunlight%20no%20people&image_size=square',
    'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=roasted%20ethiopian%20coffee%20beans%20spilling%20from%20burlap%20sack%20no%20people&image_size=square',
    'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=coffee%20beans%20roasting%20in%20drum%20roaster%20warm%20tones%20no%20people&image_size=square',
  ]
  const heroImageOptions2 = [
    'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=specialty%20coffee%20cups%20with%20flavor%20wheels%20and%20coffee%20grounds%20no%20people&image_size=square',
    'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=v60%20pour%20over%20coffee%20brewing%20clear%20glass%20carafe%20no%20people&image_size=square',
    'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=coffee%20plant%20leaves%20and%20ripe%20red%20cherries%20on%20branch%20no%20people&image_size=square',
  ]

  const [heroImage1Index, setHeroImage1Index] = useState(0)
  const [heroImage2Index, setHeroImage2Index] = useState(0)
  const [zoom1, setZoom1] = useState(false)
  const [zoom2, setZoom2] = useState(false)

  const changeImage1 = () => {
    setHeroImage1Index((prev) => (prev + 1) % heroImageOptions1.length)
  }
  const changeImage2 = () => {
    setHeroImage2Index((prev) => (prev + 1) % heroImageOptions2.length)
  }

  return (
    <div>
      {/* Hero Section - Ethiopian Coffee Harvest Background */}
      <section className="relative h-screen min-h-[600px] flex items-center text-white">
        <div className="absolute inset-0">
          <img 
            src="https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=lush%20ethiopian%20coffee%20farm%20landscape%20with%20mountains%20coffee%20plants%20no%20people&image_size=landscape_16_9" 
            alt="Ethiopian Coffee Harvest" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-primary-900/70"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-primary-200 text-lg mb-4 tracking-wider uppercase">The Birthplace of Coffee</p>
              <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
                Authentic Ethiopian Coffee Flavors
              </h1>
              <p className="text-xl mb-8 text-gray-200 max-w-lg">
                Experience the unique, exotic flavors of Ethiopian coffee, direct from sustainable farms to your cup
              </p>
              <div className="flex flex-wrap gap-4">
                <Link 
                  to="/products" 
                  className="bg-primary-600 hover:bg-primary-700 text-white px-8 py-3 rounded-lg font-semibold transition-all shadow-lg hover:shadow-xl"
                >
                  Explore Our Coffee
                </Link>
                <Link 
                  to="/contact" 
                  className="border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white hover:text-primary-900 transition-all"
                >
                  Contact Us
                </Link>
              </div>
            </div>
            <div className="relative hidden lg:block">
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <img 
                    src={heroImageOptions1[heroImage1Index]} 
                    alt="Sun Drying Coffee" 
                    className={`rounded-2xl shadow-2xl transform -rotate-3 transition-transform duration-500 cursor-pointer ${zoom1 ? 'scale-125 z-10' : ''}`}
                    onMouseEnter={() => setZoom1(true)}
                    onMouseLeave={() => setZoom1(false)}
                    onClick={changeImage1}
                  />
                </div>
                <div className="relative">
                  <img 
                    src={heroImageOptions2[heroImage2Index]} 
                    alt="Coffee Cupping" 
                    className={`rounded-2xl shadow-2xl transform rotate-3 mt-8 transition-transform duration-500 cursor-pointer ${zoom2 ? 'scale-125 z-10' : ''}`}
                    onMouseEnter={() => setZoom2(true)}
                    onMouseLeave={() => setZoom2(false)}
                    onClick={changeImage2}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ethiopian Flavor Journey */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-primary-600 font-medium mb-3 uppercase tracking-wider">Our Story</p>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">From Ethiopian Highlands to Your Cup</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">Discover the rich heritage and unique flavor profiles that make Ethiopian coffee legendary worldwide</p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="relative">
              <img 
                src="https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=ethiopian%20coffee%20farm%20landscape%20coffee%20plants%20drying%20beds%20no%20people&image_size=landscape_4_3" 
                alt="Ethiopian Coffee Farm" 
                className="rounded-3xl shadow-2xl"
              />
              <div className="absolute -bottom-6 -right-6 bg-primary-600 text-white p-6 rounded-2xl shadow-xl">
                <div className="text-5xl font-bold">100+</div>
                <div className="text-sm">Partner Farmers</div>
              </div>
            </div>
            <div>
              <div className="space-y-8">
                <div className="flex gap-6">
                  <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">🌱</span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">Sustainable Farming</h3>
                    <p className="text-gray-600">Our coffee is grown using organic, eco-friendly practices that preserve the land for generations.</p>
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">✨</span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">Unique Flavors</h3>
                    <p className="text-gray-600">From floral Yirgacheffe to fruity Guji, each region offers distinct taste experiences.</p>
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-2xl">🤝</span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">Direct Trade</h3>
                    <p className="text-gray-600">We work directly with farmers to ensure fair prices and transparent partnerships.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Products with Ethiopian Flavor Images */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-primary-600 font-medium mb-3 uppercase tracking-wider">Our Selection</p>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Featured Ethiopian Coffee</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">Explore our premium single-origin coffees from the best growing regions</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {products.map((product, index) => (
              <div key={index} className="bg-white rounded-3xl overflow-hidden shadow-xl hover:shadow-2xl transition-all group">
                <div className="relative overflow-hidden">
                  <img 
                    src={product.image} 
                    alt={product.name} 
                    className="w-full h-80 object-cover transform group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute top-4 left-4 bg-primary-600 text-white px-4 py-2 rounded-full text-sm font-semibold">
                    {product.region}
                  </div>
                </div>
                <div className="p-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">{product.name}</h3>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-primary-600">🍃</span>
                    <p className="text-gray-600 font-medium">{product.flavor}</p>
                  </div>
                  <button className="w-full bg-primary-600 text-white py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors">
                    Request Quote
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link 
              to="/products" 
              className="inline-flex items-center gap-2 border-2 border-primary-600 text-primary-600 px-8 py-3 rounded-xl font-semibold hover:bg-primary-600 hover:text-white transition-all"
            >
              View All Products
              <span>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Coffee Growing Regions */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1">
              <p className="text-primary-600 font-medium mb-3 uppercase tracking-wider">Regions</p>
              <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">Explore Ethiopia's Coffee Regions</h2>
              <p className="text-xl text-gray-600 mb-8">Each region offers unique flavor profiles shaped by altitude, soil, and tradition.</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-6 rounded-2xl hover:shadow-lg transition-shadow">
                  <h4 className="text-lg font-bold text-gray-900 mb-2">Sidama</h4>
                  <p className="text-gray-600 text-sm">Floral & Citrus</p>
                </div>
                <div className="bg-gray-50 p-6 rounded-2xl hover:shadow-lg transition-shadow">
                  <h4 className="text-lg font-bold text-gray-900 mb-2">Yirgacheffe</h4>
                  <p className="text-gray-600 text-sm">Jasmine & Tea</p>
                </div>
                <div className="bg-gray-50 p-6 rounded-2xl hover:shadow-lg transition-shadow">
                  <h4 className="text-lg font-bold text-gray-900 mb-2">Guji</h4>
                  <p className="text-gray-600 text-sm">Berry & Wine</p>
                </div>
                <div className="bg-gray-50 p-6 rounded-2xl hover:shadow-lg transition-shadow">
                  <h4 className="text-lg font-bold text-gray-900 mb-2">Harrar</h4>
                  <p className="text-gray-600 text-sm">Fruit & Spice</p>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <img 
                src="https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=ethiopian%20coffee%20regions%20map%20with%20coffee%20cherries%20and%20beans&image_size=square_hd" 
                alt="Ethiopian Coffee Regions" 
                className="rounded-3xl shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-primary-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-primary-300 font-medium mb-3 uppercase tracking-wider">Testimonials</p>
            <h2 className="text-4xl md:text-5xl font-bold mb-4">What Our Buyers Say</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white/10 p-8 rounded-3xl backdrop-blur border border-white/20">
              <div className="text-5xl mb-4">"</div>
              <p className="text-lg mb-6 text-gray-200">
                Waka Coffee has been our trusted supplier for 5 years. Their quality and reliability are unmatched.
              </p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary-600 rounded-full flex items-center justify-center font-bold">JS</div>
                <div>
                  <div className="font-semibold">John Smith</div>
                  <div className="text-sm text-primary-200">USA</div>
                </div>
              </div>
            </div>
            <div className="bg-white/10 p-8 rounded-3xl backdrop-blur border border-white/20">
              <div className="text-5xl mb-4">"</div>
              <p className="text-lg mb-6 text-gray-200">
                The attention to detail and quality control is exceptional. Highly recommend.
              </p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary-600 rounded-full flex items-center justify-center font-bold">MG</div>
                <div>
                  <div className="font-semibold">Maria Garcia</div>
                  <div className="text-sm text-primary-200">Germany</div>
                </div>
              </div>
            </div>
            <div className="bg-white/10 p-8 rounded-3xl backdrop-blur border border-white/20">
              <div className="text-5xl mb-4">"</div>
              <p className="text-lg mb-6 text-gray-200">
                Direct trade with farmers makes all the difference. Great coffee and great partners.
              </p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-primary-600 rounded-full flex items-center justify-center font-bold">TY</div>
                <div>
                  <div className="font-semibold">Takashi Yamamoto</div>
                  <div className="text-sm text-primary-200">Japan</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">Ready to Experience Premium Ethiopian Coffee?</h2>
          <p className="text-xl text-gray-600 mb-10">
            Contact us today for a custom quotation and start your journey with Waka Coffee
          </p>
          <Link 
            to="/contact" 
            className="inline-flex items-center gap-2 bg-primary-600 text-white px-12 py-4 rounded-xl font-semibold text-lg hover:bg-primary-700 transition-all shadow-xl hover:shadow-2xl"
          >
            Get a Quote Now
            <span>→</span>
          </Link>
        </div>
      </section>
    </div>
  )
}

export default Home
