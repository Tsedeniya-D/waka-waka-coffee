const Products = () => {
  const products = [
    { name: 'Sidama Grade 1', region: 'Sidama', altitude: '1,900 - 2,200m', process: 'Washed', flavor: 'Floral, Citrus, Chocolate', image: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=premium%20ethiopian%20sidama%20coffee%20beans%20in%20jute%20bag%20with%20floral%20notes%20and%20citrus%20fruits&image_size=square' },
    { name: 'Yirgacheffe Heirloom', region: 'Yirgacheffe', altitude: '1,800 - 2,100m', process: 'Washed', flavor: 'Jasmine, Bergamot, Black Tea', image: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=ethiopian%20yirgacheffe%20coffee%20beans%20close%20up%20with%20jasmine%20flowers%20and%20bergamot&image_size=square' },
    { name: 'Guji Natural', region: 'Guji', altitude: '1,950 - 2,300m', process: 'Natural', flavor: 'Berry, Wine, Chocolate', image: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=natural%20processed%20ethiopian%20guji%20coffee%20beans%20with%20fresh%20berries%20and%20wine%20grapes&image_size=square' },
    { name: 'Limu Washed', region: 'Limu', altitude: '1,700 - 2,000m', process: 'Washed', flavor: 'Citrus, Floral, Nutty', image: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=ethiopian%20limu%20coffee%20beans%20with%20citrus%20fruits%20and%20nuts&image_size=square' },
    { name: 'Jimma Organic', region: 'Jimma', altitude: '1,600 - 1,900m', process: 'Washed', flavor: 'Spice, Chocolate, Earthy', image: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=organic%20ethiopian%20jimma%20coffee%20beans%20with%20spices%20and%20chocolate&image_size=square' },
    { name: 'Harrar Longberry', region: 'Harrar', altitude: '1,700 - 2,100m', process: 'Natural', flavor: 'Fruit, Wine, Spice', image: 'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=ethiopian%20harrar%20longberry%20coffee%20beans%20with%20tropical%20fruits%20and%20spices&image_size=square' },
  ]

  return (
    <div>
      {/* Page Header with Ethiopian Coffee Background */}
      <section className="relative py-24 text-white overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src="https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=ethiopian%20coffee%20beans%20and%20cherries%20arranged%20beautifully%20with%20green%20leaves&image_size=landscape_16_9" 
            alt="Ethiopian Coffee" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-primary-900/75"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-primary-300 font-medium mb-3 uppercase tracking-wider">Our Selection</p>
          <h1 className="text-4xl md:text-6xl font-bold mb-4">Premium Ethiopian Coffee</h1>
          <p className="text-xl text-gray-200 max-w-2xl mx-auto">Discover the world's finest single-origin coffees from Ethiopia's legendary growing regions</p>
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
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
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">{product.name}</h3>
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-3">
                      <span className="text-primary-600 text-xl">🏔️</span>
                      <div className="flex-1">
                        <span className="text-gray-500 text-sm block">Altitude</span>
                        <span className="text-gray-700 font-medium">{product.altitude}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-primary-600 text-xl">⚙️</span>
                      <div className="flex-1">
                        <span className="text-gray-500 text-sm block">Process</span>
                        <span className="text-gray-700 font-medium">{product.process}</span>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-gray-100">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-primary-600">🍃</span>
                        <span className="text-gray-500 text-sm font-medium">Flavor Notes</span>
                      </div>
                      <p className="text-gray-700">{product.flavor}</p>
                    </div>
                  </div>
                  <button className="w-full bg-primary-600 text-white py-4 rounded-xl font-semibold hover:bg-primary-700 transition-colors shadow-lg hover:shadow-xl">
                    Request Quote
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export default Products
