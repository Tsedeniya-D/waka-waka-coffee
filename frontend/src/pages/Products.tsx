import { useState } from 'react'
import OrderModal from '../components/OrderModal'
import SidamoImg from '../../images/products/sidamo.png'
import YirgacheffeImg from '../../images/products/yirgacheffe.png'
import GujiImg from '../../images/products/guji.png'
import JimmaImg from '../../images/products/jimma.png'
import HararImg from '../../images/products/harar.png'
import NekemteImg from '../../images/products/nekemte.png'
import LimuImg from '../../images/products/limu.png'
import IllubaborImg from '../../images/products/illubabor.png'
import KeffaImg from '../../images/products/keffa.png'
import BaleImg from '../../images/products/bale.png'
import ArsiImg from '../../images/products/arsi.png'
import WolayitaImg from '../../images/products/wolayita.png'
import { Link } from 'react-router-dom'


const Products = () => {
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null)

  const products = [
    {
      name: 'Yirgacheffe Coffee',
      region: 'Yirgacheffe',
      packageSizes: '50kg, 60kg & 1Ton',
      originType: 'Single Origin',
      image: YirgacheffeImg
    },
    {
      name: 'Sidamo Coffee',
      region: 'Sidamo',
      packageSizes: '50kg, 60kg & 1Ton',
      originType: 'Single Origin',
      image: SidamoImg
    },
     {
    name: 'Guji Coffee',
    region: 'Guji',
    packageSizes: '50kg, 60kg & 1 Ton',
    originType: 'Single Origin',
    image: GujiImg
  },

  {
    name: 'Jimma Coffee',
    region: 'Jimma',
    packageSizes: '50kg, 60kg & 1 Ton',
    originType: 'Single Origin',
    image: JimmaImg
  },

  {
    name: 'Harar Coffee',
    region: 'Harar',
    packageSizes: '50kg, 60kg & 1 Ton',
    originType: 'Single Origin',
    image: HararImg
  },

  {
    name: 'Nekemte Coffee',
    region: 'Nekemte',
    packageSizes: '50kg, 60kg & 1 Ton',
    originType: 'Single Origin',
    image: NekemteImg
  },

  {
    name: 'Limu Coffee',
    region: 'Limu',
    packageSizes: '50kg, 60kg & 1 Ton',
    originType: 'Single Origin',
    image: LimuImg
  },

  {
    name: 'Illubabor Coffee',
    region: 'Illubabor',
    packageSizes: '50kg, 60kg & 1 Ton',
    originType: 'Single Origin',
    image: IllubaborImg
  },

  {
    name: 'Keffa Coffee',
    region: 'Keffa',
    packageSizes: '50kg, 60kg & 1 Ton',
    originType: 'Single Origin',
    image: KeffaImg
  },

  {
    name: 'Bale Coffee',
    region: 'Bale',
    packageSizes: '50kg, 60kg & 1 Ton',
    originType: 'Single Origin',
    image: BaleImg
  },

  {
    name: 'Arsi Coffee',
    region: 'Arsi',
    packageSizes: '50kg, 60kg & 1 Ton',
    originType: 'Single Origin',
    image: ArsiImg
  },

  {
    name: 'Wolayita Coffee',
    region: 'Wolayita',
    packageSizes: '50kg, 60kg & 1 Ton',
    originType: 'Single Origin',
    image: WolayitaImg
  }

  ]

  return (
    <div>
      {/* Page Header with Ethiopian Coffee Background */}
      <section className="relative py-24 text-white overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src="https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=ethiopian%20coffee%20beans%20and%20cherries%20arranged%20beautifully%20with%20green%20leaves&image_size=landscape_16_9" 
            alt="Ethiopian Coffee" 
            className="w-full h-full object-cover animate-slow-zoom"
          />
          <div className="absolute inset-0 bg-primary-900/75"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-primary-300 font-medium mb-3 uppercase tracking-wider">Our Selection</p>
          <h1 className="text-4xl md:text-6xl font-bold mb-4">Premium Ethiopian Coffee</h1>
          <p className="text-xl text-gray-200 max-w-2xl mx-auto mb-6">Discover the world's finest single-origin coffees from Ethiopia's legendary growing regions</p>
          <Link to="/request-quote" className="inline-block bg-primary-600 text-white py-3 px-8 rounded-xl font-semibold hover:bg-primary-500 transition-colors shadow-lg">
              Request Quote
          </Link>
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.map((product, index) => (
              <div
                key={index}
                className="bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 group flex flex-col justify-between"
              >

                <div>
                  {/* Product Image */}
                  <div className="h-64 bg-white flex items-center justify-center p-6 overflow-hidden">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>

                  {/* Product Information */}
                  <div className="p-6 pb-2">

                    <h3 className="text-2xl font-semibold text-gray-900 mb-6">
                      {product.name}
                    </h3>

                    {/* Package + Origin */}
                    <div className="grid grid-cols-2 gap-4 mb-4">

                      <div className="flex items-start gap-3">
                        <span className="text-gray-700 text-xl">◯</span>

                        <span className="text-gray-800 text-sm leading-5">
                          {product.packageSizes}
                        </span>
                      </div>

                      <div>
                        <span className="font-semibold text-gray-900">
                          {product.originType}
                        </span>
                      </div>

                    </div>
                  </div>
                </div>

                {/* Green Order Now Button */}
                <div className="p-6 pt-0">
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(product.name)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 px-4 rounded-xl
                    font-semibold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                  >
                    <span>Order Now</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Order Modal */}
      <OrderModal
        isOpen={Boolean(selectedProduct)}
        onClose={() => setSelectedProduct(null)}
        productName={selectedProduct || ''}
      />
    </div>
  )
}

export default Products
