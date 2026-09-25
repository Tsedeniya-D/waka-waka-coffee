import PageHeader from '../components/PageHeader'
import { Link } from 'react-router-dom'
import { Calendar, User, Tag, ArrowRight, Search, ChevronRight } from 'lucide-react'

const Blog = () => {
  const posts = [
    {
      id: 'understanding-ethiopian-coffee-grades',
      title: 'Understanding Ethiopian Coffee Grades: G1 to G5',
      excerpt:
        'A comprehensive guide to Ethiopian coffee grading standards — from Grade 1 specialty to lower commercial grades — and what each designation means for cup quality.',
      author: 'Waka Coffee Team',
      category: 'Coffee 101',
      date: 'March 15, 2026',
      readTime: '7 min read',
      featured: true,
      image:
        'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=close%20up%20green%20ethiopian%20coffee%20beans%20grading%20screens%20premium%20specialty%20quality%20no%20people&image_size=landscape_16_9',
    },
    {
      id: 'washed-vs-natural-processed-coffee',
      title: 'Washed vs. Natural vs. Honey: Processing Methods Explained',
      excerpt:
        'How washed, natural, honey, and anaerobic processing shape the flavor of Ethiopian single-origin coffee, from the farm to your cup.',
      author: 'Waka Coffee Team',
      category: 'Processing',
      date: 'March 5, 2026',
      readTime: '9 min read',
      featured: false,
      image:
        'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=coffee%20cherry%20processing%20washing%20station%20drying%20beds%20ethiopia%20farms%20no%20people&image_size=landscape_16_9',
    },
    {
      id: 'sidama-coffee-guide',
      title: 'Why Sidama Coffee Is Loved Worldwide',
      excerpt:
        'From misty highland farms to the homes of specialty coffee lovers — discover the flavor profile and history behind one of Ethiopia\'s most iconic origins.',
      author: 'Waka Coffee Team',
      category: 'Origins',
      date: 'February 22, 2026',
      readTime: '6 min read',
      featured: false,
      image:
        'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=sidama%20ethiopia%20coffee%20highlands%20lush%20green%20farm%20misty%20morning%20no%20people&image_size=landscape_16_9',
    },
    {
      id: '2026-harvest-forecast',
      title: '2026 Ethiopian Harvest Forecast & Availability Update',
      excerpt:
        'Harvest outlook for the upcoming season across the major growing regions — expected volumes, timing, and recommended forward contracting.',
      author: 'Waka Coffee Team',
      category: 'Market',
      date: 'February 10, 2026',
      readTime: '5 min read',
      featured: false,
      image:
        'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=ethiopian%20coffee%20harvest%20cherries%20farmers%20baskets%20season%20no%20people%20documentary&image_size=landscape_16_9',
    },
    {
      id: 'yirgacheffe-flavor-profile',
      title: 'Yirgacheffe: The Jasmine Tea of Coffees',
      excerpt:
        'Unpacking the delicate jasmine, bergamot, and black tea notes that make Yirgacheffe washed coffee one of the most distinctive profiles in the world.',
      author: 'Waka Coffee Team',
      category: 'Origins',
      date: 'January 30, 2026',
      readTime: '8 min read',
      featured: false,
      image:
        'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=cup%20of%20brewed%20yirgacheffe%20coffee%20jasmine%20flowers%20bergamot%20tea%20elegant%20no%20people&image_size=landscape_16_9',
    },
    {
      id: 'buyer-guide-shipping-coffee',
      title: 'Importer Guide: Shipping Ethiopian Coffee Worldwide',
      excerpt:
        'Incoterms, logistics, ocean vs air freight, documentation, and customs — the essential guide for importers purchasing Ethiopian green coffee.',
      author: 'Waka Coffee Team',
      category: 'For Buyers',
      date: 'January 18, 2026',
      readTime: '12 min read',
      featured: false,
      image:
        'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=shipping%20container%20port%20ocean%20freight%20coffee%20export%20warehouse%20logistics%20no%20people&image_size=landscape_16_9',
    },
  ]

  const categories = ['All', 'Origins', 'Processing', 'Coffee 101', 'For Buyers', 'Market']

  return (
    <div>
      <PageHeader
        eyebrow="Blog & Resources"
        title="Coffee Stories, Guides & Updates"
        description="Stories from our farms, practical guides to Ethiopian coffee origins, processing, grades, and seasonal harvest updates for our buyers."
        overlay="brown"
      />

      <section className="py-12 bg-cream-50 border-b border-coffee-100">
        <div className="container-x">
          <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${
                    cat === 'All'
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/25'
                      : 'bg-white text-coffee-700 hover:bg-coffee-100 border border-coffee-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="relative w-full md:w-auto md:min-w-[320px]">
              <Search className="w-4 h-4 text-coffee-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search articles..."
                className="w-full pl-11 pr-4 py-2.5 rounded-full bg-white border border-coffee-200 text-coffee-800 placeholder-coffee-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-cream-50">
        <div className="container-x">
          {posts[0] && (
            <Link
              to={`/blog/${posts[0].id}`}
              className="group block mb-12 grid grid-cols-1 lg:grid-cols-2 gap-8 bg-white rounded-[2rem] overflow-hidden shadow-xl hover:shadow-2xl transition-all border border-coffee-100"
            >
              <div className="aspect-[16/10] lg:aspect-auto overflow-hidden">
                <img
                  src={posts[0].image}
                  alt={posts[0].title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
              </div>
              <div className="p-8 lg:p-12 flex flex-col justify-center">
                <div className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 px-4 py-1.5 rounded-full text-xs font-semibold mb-4 w-fit">
                  <Tag className="w-3 h-3" />
                  {posts[0].category}
                  <span className="ml-1 text-primary-400">·</span>
                  <span className="font-medium">Featured</span>
                </div>
                <h2 className="text-3xl md:text-4xl font-bold font-serif text-coffee-950 mb-4 leading-tight group-hover:text-primary-700 transition-colors">
                  {posts[0].title}
                </h2>
                <p className="text-coffee-600 text-lg leading-relaxed mb-6">
                  {posts[0].excerpt}
                </p>
                <div className="flex flex-wrap items-center gap-4 text-sm text-coffee-500 mt-auto mb-6">
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4" />
                    {posts[0].author}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4" />
                    {posts[0].date}
                  </div>
                  <div>{posts[0].readTime}</div>
                </div>
                <div className="flex items-center gap-2 text-primary-700 font-semibold group-hover:gap-3 transition-all">
                  Read Full Article
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </Link>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.slice(1).map((post) => (
              <article
                key={post.id}
                className="group bg-white rounded-3xl overflow-hidden shadow-md hover:shadow-2xl transition-all duration-300 border border-coffee-100"
              >
                <Link to={`/blog/${post.id}`} className="block overflow-hidden aspect-[16/10]">
                  <img
                    src={post.image}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                </Link>
                <div className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-coffee-100 text-coffee-700">
                      {post.category}
                    </span>
                    <span className="text-xs text-coffee-500">{post.readTime}</span>
                  </div>
                  <Link to={`/blog/${post.id}`}>
                    <h3 className="text-xl font-bold text-coffee-950 mb-3 leading-tight group-hover:text-primary-700 transition-colors line-clamp-2">
                      {post.title}
                    </h3>
                  </Link>
                  <p className="text-coffee-600 text-sm leading-relaxed mb-4 line-clamp-3">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center justify-between pt-4 border-t border-coffee-100">
                    <div className="text-xs text-coffee-500 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {post.date}
                    </div>
                    <Link
                      to={`/blog/${post.id}`}
                      className="text-sm font-semibold text-primary-700 hover:text-primary-600 inline-flex items-center gap-1"
                    >
                      Read
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export default Blog
