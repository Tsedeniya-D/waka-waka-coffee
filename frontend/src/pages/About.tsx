const About = () => {
  return (
    <div>
      {/* Page Header with Ethiopian Coffee Harvest Background */}
      <section className="relative py-24 text-white overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src="https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=ethiopian%20coffee%20farmers%20harvesting%20coffee%20cherries%20in%20beautiful%20green%20plantation&image_size=landscape_16_9" 
            alt="Ethiopian Coffee Harvest" 
            className="w-full h-full object-cover animate-slow-zoom"
          />
          <div className="absolute inset-0 bg-primary-900/75"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-primary-300 font-medium mb-3 uppercase tracking-wider">About Us</p>
          <h1 className="text-4xl md:text-6xl font-bold mb-4">Waka Coffee</h1>
          <p className="text-xl text-gray-200 max-w-2xl mx-auto">Our Story, Mission & Vision for Premium Ethiopian Coffee</p>
        </div>
      </section>

      {/* Our Story */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1">
              <p className="text-primary-600 font-medium mb-3 uppercase tracking-wider">Our Story</p>
              <h2 className="text-4xl font-bold text-gray-900 mb-8">From Ethiopian Highlands to the World</h2>
              <div className="space-y-6 text-gray-600 text-lg leading-relaxed">
                <p>
                  Founded in 2014, Waka Coffee began with a simple mission: to bring the finest Ethiopian coffee directly from farmers to coffee lovers worldwide.
                </p>
                <p>
                  Our journey started in the heart of Sidama, where we worked closely with local farmers to improve quality and establish fair trade practices.
                </p>
                <p>
                  Today, we partner with over 350 farmers across 10+ major coffee-growing regions of Ethiopia, exporting premium coffee to more than 30 countries.
                </p>
              </div>
            </div>
            <div className="order-1 lg:order-2 relative">
              <img 
                src="https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=ethiopian%20coffee%20farmers%20working%20together%20in%20coffee%20plantation%20with%20mountains&image_size=landscape_4_3" 
                alt="Our Story" 
                className="rounded-3xl shadow-2xl"
              />
              <div className="absolute -bottom-8 -left-8 bg-primary-600 text-white p-8 rounded-2xl shadow-xl hidden lg:block">
                <div className="text-5xl font-bold mb-2">14+</div>
                <div className="text-lg">Years of Excellence</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission & Vision */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-primary-600 font-medium mb-3 uppercase tracking-wider">Our Purpose</p>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">Mission & Vision</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-10 rounded-3xl shadow-xl hover:shadow-2xl transition-shadow">
              <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mb-8">
                <span className="text-4xl">🎯</span>
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-6">Our Mission</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                To connect Ethiopian coffee farmers with global markets through sustainable, ethical, and transparent trade practices, while delivering exceptional quality coffee.
              </p>
            </div>
            <div className="bg-white p-10 rounded-3xl shadow-xl hover:shadow-2xl transition-shadow">
              <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mb-8">
                <span className="text-4xl">🌟</span>
              </div>
              <h3 className="text-3xl font-bold text-gray-900 mb-6">Our Vision</h3>
              <p className="text-gray-600 text-lg leading-relaxed">
                To be the leading exporter of premium Ethiopian coffee, recognized globally for quality, sustainability, and commitment to farmer empowerment.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Ethiopia */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-primary-600 font-medium mb-3 uppercase tracking-wider">Why Ethiopia</p>
            <h2 className="text-4xl font-bold text-gray-900 mb-4">The Birthplace of Coffee</h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">Discover what makes Ethiopian coffee truly special</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center p-8 rounded-3xl bg-gray-50 hover:bg-primary-50 transition-colors group">
              <div className="text-6xl mb-6 group-hover:scale-110 transition-transform">🌍</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Origins</h3>
              <p className="text-gray-600 text-lg">Coffee was first discovered in Ethiopia over 1,000 years ago in the highlands of Kaffa</p>
            </div>
            <div className="text-center p-8 rounded-3xl bg-gray-50 hover:bg-primary-50 transition-colors group">
              <div className="text-6xl mb-6 group-hover:scale-110 transition-transform">☕</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Biodiversity</h3>
              <p className="text-gray-600 text-lg">Home to thousands of unique coffee varieties found nowhere else on Earth</p>
            </div>
            <div className="text-center p-8 rounded-3xl bg-gray-50 hover:bg-primary-50 transition-colors group">
              <div className="text-6xl mb-6 group-hover:scale-110 transition-transform">🏔️</div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Altitude</h3>
              <p className="text-gray-600 text-lg">Perfect growing conditions at 1,500-2,500 meters above sea level</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default About
