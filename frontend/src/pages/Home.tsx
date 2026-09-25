import { Link } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import Hero2Img from '../../images/hero/hero2.png'
import EthiopiaMapImg from '../../images/ethiopiaMap.jpg'
import YirgacheffeImg from '../../images/products/yirgacheffe.png'
import SidamoImg from '../../images/products/sidamo.png'
import GujiImg from '../../images/products/guji.png'

const Home = () => {

  const products = [
    {
      name: 'Yirgacheffe Coffee',
      region: 'Yirgacheffe',
      packageSizes: '50kg, 60kg & 1Ton',
      originType: 'Single Origin',
      flavor: 'Floral, Jasmine & Bergamot',
      image: YirgacheffeImg,
    },
    {
      name: 'Sidamo Coffee',
      region: 'Sidamo',
      packageSizes: '50kg, 60kg & 1Ton',
      originType: 'Single Origin',
      flavor: 'Citrus, Berry & Milk Chocolate',
      image: SidamoImg,
    },
    {
      name: 'Guji Coffee',
      region: 'Guji',
      packageSizes: '50kg, 60kg & 1Ton',
      originType: 'Single Origin',
      flavor: 'Wild Berry, Winey & Dark Chocolate',
      image: GujiImg,
    },
  ]

  // Hero Slides Data
  const heroSlides = [
    { 
      title: 'Premium Ethiopian Coffee', 
      subtitle: 'Exporting exceptional coffee beans from Ethiopia to customers worldwide.',
      image: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=ethiopian%20coffee%20plantation%20lush%20green%20farm%20landscape%20no%20people&image_size=landscape_16_9'
    },
    { 
      title: 'Quality From Farm to Cup', 
      subtitle: 'Every bean is carefully selected, processed, and packaged for international standards.',
      image: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=coffee%20roasting%20facility%20roasted%20beans%20no%20people&image_size=landscape_16_9'
    },
    { 
      title: 'Reliable Global Coffee Export', 
      subtitle: 'Fast logistics, trusted partnerships, and sustainable coffee sourcing.',
      image: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=coffee%20export%20warehouse%20containers%20no%20people&image_size=landscape_16_9'
    },
    { 
      title: 'Experience Authentic Ethiopian Coffee', 
      subtitle: 'Taste the rich aroma and heritage of one of the world\'s finest coffee origins.',
      image: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=freshly%20brewed%20ethiopian%20coffee%20cup%20no%20people&image_size=landscape_16_9'
    }
    ,
    {
      title: 'Our Latest Harvest',
      subtitle: 'Freshly harvested, traceable lots ready for export.',
      image: Hero2Img,
    }
  ]

  const [currentSlide, setCurrentSlide] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const sliderRef = useRef<HTMLDivElement>(null)

  // Auto-play
  useEffect(() => {
    if (isPaused) return
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [isPaused])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setCurrentSlide((prev) => (prev - 1 + heroSlides.length) % heroSlides.length)
      } else if (e.key === 'ArrowRight') {
        setCurrentSlide((prev) => (prev + 1) % heroSlides.length)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % heroSlides.length)
  }

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + heroSlides.length) % heroSlides.length)
  }

  return (
    <div>
      {/* Hero Slider Section */}
      <section 
        ref={sliderRef}
        className="relative min-h-screen overflow-hidden"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {heroSlides.map((slide, index) => (
          <div
            key={index}
            className={`absolute inset-0 transition-opacity duration-1000 ${index === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0'}`}
          >
            <img 
              src={slide.image} 
              alt={slide.title} 
              className={`w-full h-full object-cover transition-transform duration-10000 ease-out ${index === currentSlide ? 'scale-110' : 'scale-100'}`}
            />
            <div className="absolute inset-0 bg-gray-900/45"></div>
          </div>
        ))}

        {/* Hero Content */}
        <div className="relative z-20 h-full flex items-center">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 w-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div className="text-white">
                <p className="text-primary-400 text-lg mb-4 tracking-wider uppercase font-medium">Waka Coffee Export</p>
                <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
                  {heroSlides[currentSlide].title}
                </h1>
                <p className="text-xl mb-8 text-gray-200 max-w-lg">
                  {heroSlides[currentSlide].subtitle}
                </p>
                <div className="flex flex-wrap gap-4">
                  <Link
                    to="/contact#contact-form"
                    className="bg-primary-700 hover:bg-primary-600 text-white px-8 py-4 rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                  >
                    ✉️ Contact Us
                  </Link>
                  <Link
                    to="/request-quote"
                    className="border-2 border-white text-white px-8 py-4 rounded-xl font-semibold hover:bg-white hover:text-gray-900 transition-all transform hover:-translate-y-1"
                  >
                    📦 Request a Quote
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Arrows */}
        <button
          onClick={prevSlide}
          className="absolute left-4 md:left-8 top-1/2 transform -translate-y-1/2 z-30 w-14 h-14 rounded-full bg-gray-900/60 hover:bg-gray-800/80 text-white flex items-center justify-center transition-all hover:scale-110 hover:shadow-2xl"
          aria-label="Previous slide"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          onClick={nextSlide}
          className="absolute right-4 md:right-8 top-1/2 transform -translate-y-1/2 z-30 w-14 h-14 rounded-full bg-gray-900/60 hover:bg-gray-800/80 text-white flex items-center justify-center transition-all hover:scale-110 hover:shadow-2xl"
          aria-label="Next slide"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Slider Indicators */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-30 flex gap-3">
          {heroSlides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`h-3 rounded-full transition-all duration-300 ${index === currentSlide ? 'w-10 bg-primary-600' : 'w-3 bg-gray-400 hover:bg-gray-300'}`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
        {/* Bottom caption overlay removed as requested */}
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

      {/* Featured Products */}
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
                  <Link
                    to={`/request-quote?product=${encodeURIComponent(product.name)}`}
                    className="block text-center w-full bg-primary-600 text-white py-3 rounded-xl font-semibold hover:bg-primary-700 transition-colors"
                  >
                    Request Quote
                  </Link>
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
                src={EthiopiaMapImg}
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
            to="/request-quote"
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
