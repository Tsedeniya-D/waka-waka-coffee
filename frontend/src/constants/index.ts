export const SITE_CONFIG = {
  name: 'Waka Coffee',
  fullName: 'Waka Coffee Export',
  tagline: 'Premium Ethiopian Coffee Exports',
  description:
    'Premium Ethiopian coffee exporter delivering exceptional single-origin beans from Sidama, Yirgacheffe, Guji, and more to buyers worldwide.',
  email: {
    info: 'info@wakacoffee.com',
    sales: 'sales@wakacoffee.com',
    support: 'support@wakacoffee.com',
  },
  phone: {
    primary: '+251 911 123 456',
    secondary: '+251 911 654 321',
    whatsapp: '+251 911 123 456',
  },
  address: {
    street: 'Available on request',
    city: 'Addis Ababa',
    country: 'Ethiopia',
  },
  social: {
    facebook: '#',
    instagram: '#',
    linkedin: '#',
    twitter: '#',
    youtube: '#',
  },
  businessHours: {
    weekdays: 'Monday - Friday: 8:00 AM - 6:00 PM (EAT)',
    saturday: 'Saturday: 9:00 AM - 2:00 PM (EAT)',
    sunday: 'Sunday: Closed',
  },
} as const

export const NAV_LINKS = [
  { name: 'Home', path: '/' },
  { name: 'About', path: '/about' },
  { name: 'Products', path: '/products' },
  { name: 'Origins', path: '/origins' },
  { name: 'Export Process', path: '/export-process' },
  { name: 'Services', path: '/services' },
  { name: 'Quality & Traceability', path: '/quality' },
  { name: 'Blog', path: '/blog' },
  { name: 'FAQ', path: '/faq' },
  { name: 'Contact', path: '/contact' },
] as const

export const FOOTER_QUICK_LINKS = [
  { name: 'About Us', path: '/about' },
  { name: 'Our Products', path: '/products' },
  { name: 'Coffee Origins', path: '/origins' },
  { name: 'Services', path: '/services' },
  { name: 'Quality & Traceability', path: '/quality' },
  { name: 'Request Quote', path: '/request-quote' },
  { name: 'Contact', path: '/contact' },
] as const

export const COFFEE_REGIONS = [
  {
    name: 'Sidama',
    flavors: 'Floral, Citrus, Chocolate',
    altitude: '1,900 - 2,200m',
    description:
      'Known for its vibrant acidity and well-balanced floral notes, Sidama produces some of the most consistent and sought-after washed coffees in Ethiopia.',
  },
  {
    name: 'Yirgacheffe',
    flavors: 'Jasmine, Bergamot, Black Tea',
    altitude: '1,800 - 2,100m',
    description:
      'The crown jewel of Ethiopian washed coffees, Yirgacheffe is celebrated internationally for its distinctive jasmine aroma and tea-like complexity.',
  },
  {
    name: 'Guji',
    flavors: 'Berry, Wine, Chocolate',
    altitude: '1,950 - 2,300m',
    description:
      'A relatively new but prestigious region producing exceptional natural and anaerobic coffees with intense fruit-forward profiles.',
  },
  {
    name: 'Harrar',
    flavors: 'Fruit, Wine, Spice',
    altitude: '1,700 - 2,100m',
    description:
      'One of the oldest coffee origins in the world. Natural-processed Harrar is famous for its complex notes of blueberry, wine, and black pepper.',
  },
  {
    name: 'Limu',
    flavors: 'Citrus, Floral, Nutty',
    altitude: '1,700 - 2,000m',
    description:
      'A historic western Ethiopian origin producing sweet, balanced coffees with clean citrus brightness and nutty undertones.',
  },
  {
    name: 'Jimma',
    flavors: 'Spice, Chocolate, Earthy',
    altitude: '1,600 - 1,900m',
    description:
      'The largest historical coffee-producing region in Ethiopia, offering robust, full-bodied coffees with spice and chocolate notes.',
  },
  {
    name: 'Kaffa',
    flavors: 'Wild fruit, Spice, Floral',
    altitude: '1,700 - 2,200m',
    description:
      'The legendary birthplace of coffee. Kaffa offers wild, heirloom varieties with rich, complex and uniquely Ethiopian character.',
  },
] as const

export const PROCESSING_METHODS = [
  {
    id: 'washed',
    name: 'Washed / Wet Processed',
    description:
      'Coffee cherries are depulped, fermented to remove mucilage, then washed and dried on raised beds. Produces clean, bright, and consistent cup profiles.',
  },
  {
    id: 'natural',
    name: 'Natural / Sundried',
    description:
      'Coffee cherries are dried intact with all layers on the fruit. Produces bold, fruity, wine-like and deeply aromatic cup profiles.',
  },
  {
    id: 'honey',
    name: 'Honey / Pulped Natural',
    description:
      'Cherries are depulped with varying amounts of mucilage left on the parchment during drying. Balances sweetness with clean acidity.',
  },
  {
    id: 'anaerobic',
    name: 'Anaerobic Fermentation',
    description:
      'Cherries or parchment are sealed in oxygen-free tanks during fermentation, producing exotic, intensely fruited and complex flavors.',
  },
] as const

export const GRADES = [
  { id: 'G1', name: 'Grade 1', description: 'Premium specialty grade, highest quality standard' },
  { id: 'G2', name: 'Grade 2', description: 'Excellent commercial specialty grade' },
  { id: 'G3', name: 'Grade 3', description: 'Standard commercial grade' },
  { id: 'G4', name: 'Grade 4', description: 'Standard commercial grade' },
  { id: 'G5', name: 'Grade 5', description: 'Standard lower commercial grade' },
] as const

export const RFQ_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: 'New', color: 'bg-blue-100 text-blue-800' },
  contacted: { label: 'Contacted', color: 'bg-yellow-100 text-yellow-800' },
  qualified: { label: 'Qualified', color: 'bg-indigo-100 text-indigo-800' },
  sample_requested: { label: 'Sample Requested', color: 'bg-purple-100 text-purple-800' },
  sample_sent: { label: 'Sample Sent', color: 'bg-pink-100 text-pink-800' },
  quotation_sent: { label: 'Quotation Sent', color: 'bg-green-100 text-green-800' },
  negotiation: { label: 'In Negotiation', color: 'bg-orange-100 text-orange-800' },
  confirmed: { label: 'Confirmed', color: 'bg-emerald-100 text-emerald-800' },
  completed: { label: 'Completed', color: 'bg-gray-100 text-gray-800' },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800' },
} as const

export const AVAILABILITY_LABELS: Record<string, { label: string; color: string }> = {
  available: { label: 'In Stock', color: 'bg-primary-100 text-primary-800' },
  limited: { label: 'Limited', color: 'bg-yellow-100 text-yellow-800' },
  sold_out: { label: 'Sold Out', color: 'bg-red-100 text-red-800' },
  available_on_request: { label: 'Available on Request', color: 'bg-blue-100 text-blue-800' },
} as const

export const EXPORT_STEPS = [
  {
    step: 1,
    title: 'Sourcing',
    description:
      'We select coffee directly from partner farms and cooperatives across Ethiopia\'s finest growing regions, ensuring fair prices and transparent partnerships.',
    icon: '🌱',
  },
  {
    step: 2,
    title: 'Processing',
    description:
      'Cherries are processed using washed, natural, honey, or experimental methods at our partner washing stations, carefully monitored for quality.',
    icon: '⚙️',
  },
  {
    step: 3,
    title: 'Quality Control',
    description:
      'Every lot undergoes multiple quality checks including visual inspection, screen size sorting, density separation, and professional cupping.',
    icon: '✨',
  },
  {
    step: 4,
    title: 'Grading',
    description:
      'Coffee is graded according to the Ethiopian Commodity Exchange standard based on screen size, defect count, and cup quality.',
    icon: '📊',
  },
  {
    step: 5,
    title: 'Packaging',
    description:
      'Green coffee is packed in new food-grade jute bags or GrainPro lined bags according to buyer specification, preserving freshness.',
    icon: '📦',
  },
  {
    step: 6,
    title: 'Documentation',
    description:
      'We prepare all required export documentation including phytosanitary certificate, certificate of origin, bill of lading, and packing list.',
    icon: '📄',
  },
  {
    step: 7,
    title: 'Export',
    description:
      'Consignments are exported through Djibouti or dry port per arrangement, with full logistics coordination and shipment tracking.',
    icon: '🚢',
  },
  {
    step: 8,
    title: 'Shipping',
    description:
      'Coffee is shipped via FCL or LCL ocean freight, with optional air freight for sample or urgent orders. Transit times confirmed per destination.',
    icon: '✈️',
  },
] as const
