interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  image?: string
  overlay?: 'green' | 'brown' | 'dark'
}

const PageHeader = ({
  eyebrow,
  title,
  description,
  image,
  overlay = 'green',
}: PageHeaderProps) => {
  const defaultImages: Record<string, string> = {
    green:
      'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=ethiopian%20coffee%20plantation%20lush%20green%20mountains%20misty%20morning%20no%20people&image_size=landscape_16_9',
    brown:
      'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=roasted%20ethiopian%20coffee%20beans%20premium%20texture%20macro%20no%20people&image_size=landscape_16_9',
    dark:
      'https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=coffee%20export%20warehouse%20industrial%20bags%20shipping%20containers%20no%20people&image_size=landscape_16_9',
  }

  const bgImage = image || defaultImages[overlay]

  const overlayClasses: Record<string, string> = {
    green: 'bg-primary-900/70',
    brown: 'bg-coffee-900/70',
    dark: 'bg-gray-900/75',
  }

  return (
    <section className="relative pt-24 pb-20 text-white overflow-hidden">
      <div className="absolute inset-0">
        <img
          src={bgImage}
          alt={title}
          className="w-full h-full object-cover animate-slow-zoom"
        />
        <div className={`absolute inset-0 ${overlayClasses[overlay]}`} />
      </div>
      <div className="container-x relative z-10">
        <div className="max-w-3xl">
          {eyebrow && (
            <p className="text-primary-300 font-medium mb-4 uppercase tracking-widest text-sm animate-fade-in">
              {eyebrow}
            </p>
          )}
          <h1 className="text-4xl md:text-6xl font-bold font-serif mb-6 leading-tight animate-fade-in-up">
            {title}
          </h1>
          {description && (
            <p className="text-xl text-gray-200 max-w-2xl animate-fade-in-up [animation-delay:200ms] [animation-fill-mode:both]">
              {description}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

export default PageHeader
