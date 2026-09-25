import PageHeader from '../components/PageHeader'
import { Link, useParams } from 'react-router-dom'
import { Calendar, User, Tag, ArrowLeft, ArrowRight, ChevronLeft } from 'lucide-react'

const BlogDetail = () => {
  const { slug } = useParams()

  const post = {
    id: slug || 'article',
    title: 'Understanding Ethiopian Coffee Grades: G1 to G5',
    content: `
      <p class="mb-6 leading-relaxed text-coffee-700 text-lg">
        Ethiopian coffee grading is one of the most rigorous in the world. It combines visual inspection, screen size analysis, defect counting, and professional cupping to ensure consistency. Understanding grades is essential for buyers selecting Ethiopian single-origin coffee.
      </p>
      <h3 class="text-2xl font-bold font-serif text-coffee-950 mb-4 mt-12">What is Grade 1 (G1)?</h3>
      <p class="mb-6 leading-relaxed text-coffee-700">
        Grade 1 represents the highest standard of specialty green coffee produced in Ethiopia. It requires a maximum of 3 defects per 300g sample and strict screen-size consistency. G1 lots are typically reserved for specialty roasters who prize complexity, clarity, and cup scores above 84 points.
      </p>
      <h3 class="text-2xl font-bold font-serif text-coffee-950 mb-4 mt-12">Grade 2 (G2) — Excellent Commercial Specialty</h3>
      <p class="mb-6 leading-relaxed text-coffee-700">
        Grade 2 coffee still represents exceptional quality and is the backbone of many successful specialty programs globally. It allows up to 12 defects per 300g sample and is often very similar in cup profile to G1 lots, usually separated only by minor screen variation.
      </p>
      <h3 class="text-2xl font-bold font-serif text-coffee-950 mb-4 mt-12">Grade 3, 4, and 5 — Commercial Grades</h3>
      <p class="mb-6 leading-relaxed text-coffee-700">
        Grade 3 through Grade 5 represent commercial-grade coffees suitable for blending, commodity-grade espresso, and soluble applications. These grades still offer distinctive Ethiopian character but with increasing defects and wider screen size ranges.
      </p>
      <h3 class="text-2xl font-bold font-serif text-coffee-950 mb-4 mt-12">How We Grade at Waka Coffee</h3>
      <p class="mb-6 leading-relaxed text-coffee-700">
        Every lot Waka Coffee exports undergoes our own multi-stage quality review, including independent Q-Grader cupping, moisture analysis, and double-check defect hand sorting on top of government grading. We only offer lots that meet or exceed the declared grade standard.
      </p>
      <blockquote class="border-l-4 border-primary-500 bg-primary-50 pl-6 pr-4 py-6 my-10 rounded-r-2xl italic text-lg text-primary-900">
        "Grade is a baseline guarantee, not a limit on cup quality. We regularly cup G2 lots that outscore contract G1 lots — that is the magic and the mystery of Ethiopian coffee."
      </blockquote>
    `,
    author: 'Waka Coffee Team',
    category: 'Coffee 101',
    date: 'March 15, 2026',
    readTime: '7 min read',
    image:
      'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=close%20up%20green%20ethiopian%20coffee%20beans%20grading%20screens%20premium%20specialty%20quality%20no%20people&image_size=landscape_16_9',
  }

  return (
    <div>
      <PageHeader
        eyebrow="Blog & Resources"
        title={post.title}
        description={`${post.date} · ${post.readTime} · ${post.category}`}
        overlay="brown"
      />

      <section className="py-16 bg-cream-50">
        <div className="container-x">
          <div className="max-w-3xl mx-auto mb-12">
            <Link
              to="/blog"
              className="inline-flex items-center gap-2 text-primary-700 hover:text-primary-600 font-medium mb-8"
            >
              <ChevronLeft className="w-4 h-4" />
              Back to Blog
            </Link>
            <div className="flex flex-wrap gap-4 mb-8 text-sm">
              <div className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 px-4 py-1.5 rounded-full font-semibold">
                <Tag className="w-3 h-3" />
                {post.category}
              </div>
              <div className="inline-flex items-center gap-2 text-coffee-500">
                <User className="w-4 h-4" />
                {post.author}
              </div>
              <div className="inline-flex items-center gap-2 text-coffee-500">
                <Calendar className="w-4 h-4" />
                {post.date}
              </div>
            </div>
            <div className="aspect-[16/9] rounded-[2rem] overflow-hidden shadow-2xl mb-12">
              <img
                src={post.image}
                alt={post.title}
                className="w-full h-full object-cover"
              />
            </div>
            <div
              className="prose prose-coffee max-w-none prose-headings:font-serif prose-headings:text-coffee-950 prose-p:text-coffee-700 prose-a:text-primary-600 prose-strong:text-coffee-900"
              dangerouslySetInnerHTML={{ __html: post.content }}
            />
          </div>

          <div className="max-w-3xl mx-auto mt-16 p-8 md:p-12 rounded-[2rem] bg-coffee-950 text-white">
            <h3 className="text-2xl md:text-3xl font-bold font-serif mb-4">
              Want to Explore Our Graded Coffees?
            </h3>
            <p className="text-coffee-300 mb-8 leading-relaxed">
              Request a graded sample set with cupping notes or open an
              inquiry to discuss the best grade options for your program.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                to="/products"
                className="inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-500 text-white font-semibold px-6 py-3.5 rounded-2xl transition-colors shadow-lg shadow-primary-600/30"
              >
                Browse Coffee Catalog
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/request-sample"
                className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-6 py-3.5 rounded-2xl transition-colors border border-white/20"
              >
                <ArrowLeft className="w-4 h-4" />
                Request Samples
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default BlogDetail
