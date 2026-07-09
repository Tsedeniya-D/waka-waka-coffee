const Contact = () => {
  return (
    <div>
      {/* Page Header with Ethiopian Coffee Background */}
      <section className="relative py-24 text-white overflow-hidden">
        <div className="absolute inset-0">
          <img 
            src="https://coresg-normal.trae.ai/api/ide/v1/text_to_image?prompt=beautiful%20ethiopian%20coffee%20beans%20and%20cherries%20arranged%20artistically&image_size=landscape_16_9" 
            alt="Ethiopian Coffee" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-primary-900/75"></div>
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-primary-300 font-medium mb-3 uppercase tracking-wider">Get In Touch</p>
          <h1 className="text-4xl md:text-6xl font-bold mb-4">Contact Us</h1>
          <p className="text-xl text-gray-200 max-w-2xl mx-auto">Ready to start your journey with premium Ethiopian coffee? We'd love to hear from you!</p>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            {/* Contact Form */}
            <div>
              <p className="text-primary-600 font-medium mb-3 uppercase tracking-wider">Send a Message</p>
              <h2 className="text-4xl font-bold text-gray-900 mb-8">Get In Touch</h2>
              <form className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">First Name</label>
                    <input 
                      type="text" 
                      className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-primary-100 focus:border-primary-600 outline-none transition-all"
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">Last Name</label>
                    <input 
                      type="text" 
                      className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-primary-100 focus:border-primary-600 outline-none transition-all"
                      placeholder="Doe"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Email</label>
                  <input 
                    type="email" 
                    className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-primary-100 focus:border-primary-600 outline-none transition-all"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Company</label>
                  <input 
                    type="text" 
                    className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-primary-100 focus:border-primary-600 outline-none transition-all"
                    placeholder="Your Company"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Message</label>
                  <textarea 
                    rows={6} 
                    className="w-full px-5 py-4 border-2 border-gray-200 rounded-xl focus:ring-4 focus:ring-primary-100 focus:border-primary-600 outline-none transition-all resize-none"
                    placeholder="Tell us about your coffee needs..."
                  ></textarea>
                </div>
                <button 
                  type="submit" 
                  className="w-full bg-primary-600 text-white py-4 px-8 rounded-xl font-semibold text-lg hover:bg-primary-700 transition-all shadow-lg hover:shadow-xl"
                >
                  Send Message
                </button>
              </form>
            </div>

            {/* Contact Information */}
            <div className="lg:pl-8">
              <p className="text-primary-600 font-medium mb-3 uppercase tracking-wider">Contact Information</p>
              <h2 className="text-4xl font-bold text-gray-900 mb-8">Let's Connect</h2>
              <div className="space-y-8">
                <div className="flex items-start gap-6 p-6 bg-gray-50 rounded-2xl hover:bg-primary-50 transition-colors group">
                  <div className="w-16 h-16 bg-primary-100 group-hover:bg-primary-200 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors">
                    <span className="text-2xl">📍</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Address</h3>
                    <p className="text-gray-600 text-lg">Addis Ababa, Ethiopia</p>
                  </div>
                </div>
                <div className="flex items-start gap-6 p-6 bg-gray-50 rounded-2xl hover:bg-primary-50 transition-colors group">
                  <div className="w-16 h-16 bg-primary-100 group-hover:bg-primary-200 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors">
                    <span className="text-2xl">📧</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Email</h3>
                    <p className="text-gray-600 text-lg">info@wakacoffee.com</p>
                    <p className="text-gray-600 text-lg">sales@wakacoffee.com</p>
                  </div>
                </div>
                <div className="flex items-start gap-6 p-6 bg-gray-50 rounded-2xl hover:bg-primary-50 transition-colors group">
                  <div className="w-16 h-16 bg-primary-100 group-hover:bg-primary-200 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors">
                    <span className="text-2xl">📱</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Phone</h3>
                    <p className="text-gray-600 text-lg">+251 911 123 456</p>
                    <p className="text-gray-600 text-lg">+251 911 654 321</p>
                  </div>
                </div>
                <div className="flex items-start gap-6 p-6 bg-gray-50 rounded-2xl hover:bg-primary-50 transition-colors group">
                  <div className="w-16 h-16 bg-primary-100 group-hover:bg-primary-200 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors">
                    <span className="text-2xl">💬</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">WhatsApp</h3>
                    <p className="text-gray-600 text-lg">+251 911 123 456</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Contact
