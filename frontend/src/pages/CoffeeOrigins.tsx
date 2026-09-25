import PageHeader from '../components/PageHeader'
import { Link } from 'react-router-dom'
import { COFFEE_REGIONS } from '../constants'
import { MapPin, Mountain, Droplets } from 'lucide-react'
import originBgImg from '../../images/origin/originBG.jpg'
import EthiopiaMapImg from '../../images/ethiopiaMap.jpg'

const CoffeeOrigins = () => {
  return (
    <div>
      <PageHeader
        eyebrow="Coffee Origins"
        title="Ethiopia's Legendary Coffee Regions"
        description="Explore the diverse terroirs that produce the world's most distinctive coffees — from the misty highlands of Sidama to the ancient wild forests of Kaffa."
        image={originBgImg}
        overlay="green"
      />

      <section className="py-20 bg-cream-50">
        <div className="container-x">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {COFFEE_REGIONS.map((region, index) => (
              <div
                key={region.name}
                id={region.name.toLowerCase()}
                className="bg-white rounded-3xl p-8 shadow-lg hover:shadow-2xl transition-all duration-500 border border-coffee-100 flex flex-col justify-between group"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div>
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <h3 className="text-2xl font-bold text-coffee-950 font-serif">
                      {region.name}
                    </h3>
                    <div className="flex items-center gap-1.5 bg-primary-50 text-primary-700 px-3 py-1.5 rounded-full text-xs font-medium shrink-0">
                      <Mountain className="w-3.5 h-3.5" />
                      {region.altitude}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mb-4 bg-cream-50 p-4 rounded-2xl border border-coffee-100">
                    <Droplets className="w-5 h-5 text-primary-600 shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-coffee-500 uppercase tracking-wider">
                        Flavor Profile
                      </p>
                      <p className="text-coffee-950 font-semibold text-sm">{region.flavors}</p>
                    </div>
                  </div>

                  <p className="text-coffee-600 text-sm leading-relaxed mb-6">
                    {region.description}
                  </p>
                </div>

                <Link
                  to={`/products?region=${region.name.toLowerCase()}`}
                  className="inline-flex items-center gap-2 text-primary-700 font-semibold hover:text-primary-600 transition-colors text-sm pt-4 border-t border-coffee-100"
                >
                  View {region.name} Coffees
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-white">
        <div className="container-x">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-primary-600 font-medium mb-4 uppercase tracking-widest text-sm">
                Interactive Map
              </p>
              <h2 className="text-3xl md:text-4xl font-bold font-serif text-coffee-950 mb-6">
                Find Your Origin
              </h2>
              <p className="text-coffee-600 text-lg leading-relaxed mb-8">
                Ethiopia's coffee growing regions stretch across the southern, western, and
                eastern highlands. Each microclimate, soil type, and farmer tradition
                produces distinctly different cup profiles. The map shows our primary
                sourcing areas.
              </p>
              <div className="space-y-4">
                {COFFEE_REGIONS.slice(0, 4).map((region) => (
                  <div key={region.name} className="flex items-center gap-4 p-4 bg-cream-50 rounded-2xl hover:bg-primary-50 transition-colors">
                    <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5 text-primary-700" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-coffee-900">{region.name}</h4>
                      <p className="text-sm text-coffee-500">{region.altitude} · {region.flavors}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="aspect-square rounded-3xl overflow-hidden shadow-2xl p-8 bg-cream-100 border-4 border-white">
                <img
                  src={EthiopiaMapImg}
                  alt="Ethiopian Coffee Regions Map"
                  className="w-full h-full object-cover rounded-2xl"
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default CoffeeOrigins
