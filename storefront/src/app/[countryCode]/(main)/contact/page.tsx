import { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with our team.",
}

export default function ContactPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
      {/* 1. Header Section */}
      <div className="max-w-2xl mx-auto text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Contact Us</h1>
        <p className="mt-4 text-lg text-gray-500">
          Have a question about our products or your order? We're here to help.
        </p>
        
        {/* NEW: FAQ Deflection Banner */}
        <div className="mt-6 inline-flex items-center justify-center p-4 bg-gray-50 rounded-lg border border-gray-100 text-sm text-gray-600">
          <span className="mr-2">💡 Need an instant answer?</span>
          <Link href="/faq" className="font-semibold text-gray-900 hover:underline">
            Check our Frequently Asked Questions
          </Link>
        </div>
      </div>

      {/* 2. Main Content Grid (Form left, Map right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16 items-start">
        
        {/* LEFT COLUMN: Contact Form */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
          <form className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="first-name" className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input type="text" id="first-name" required className="block w-full rounded-lg border-gray-300 px-4 py-3 border focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 transition-shadow" />
              </div>
              <div>
                <label htmlFor="last-name" className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input type="text" id="last-name" required className="block w-full rounded-lg border-gray-300 px-4 py-3 border focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 transition-shadow" />
              </div>
            </div>
            
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input type="email" id="email" required className="block w-full rounded-lg border-gray-300 px-4 py-3 border focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 transition-shadow" />
            </div>

            {/* NEW: Reason for Contact Dropdown */}
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">How can we help?</label>
              <select id="subject" required className="block w-full rounded-lg border-gray-300 px-4 py-3 border focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 transition-shadow bg-white">
                <option value="">Select a topic...</option>
                <option value="order">Where is my order?</option>
                <option value="return">Returns & Exchanges</option>
                <option value="product">Product Question</option>
                <option value="other">Other</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea id="message" rows={5} required className="block w-full rounded-lg border-gray-300 px-4 py-3 border focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 transition-shadow resize-none"></textarea>
            </div>
            
            <button type="submit" className="w-full flex justify-center py-3 px-4 rounded-lg shadow-sm text-sm font-bold text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-900 transition-all">
              Send Message
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: Google Map & Trust Badges */}
        <div className="flex flex-col gap-6">
          <div className="h-[400px] w-full bg-gray-100 rounded-2xl overflow-hidden shadow-sm border border-gray-200 relative group">
            <iframe 
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d26545.626463999554!2d150.91617260565882!3d-33.89602410887372!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x6b12beabf0b5d84b%3A0x5017d681632ad40!2sCabramatta%20NSW%202166!5e0!3m2!1sen!2sau!4v1713259868726!5m2!1sen!2sau" 
              width="100%" 
              height="100%" 
              style={{ border: 0 }} 
              allowFullScreen={false} 
              loading="lazy" 
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0 grayscale contrast-125 opacity-90 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500"
            ></iframe>
          </div>

          {/* NEW: Trust Badges */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-1">Email Us</h3>
              <p className="text-sm text-gray-500">support@yourstore.com</p>
            </div>
            <div className="bg-gray-50 p-6 rounded-xl border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-1">Store Hours</h3>
              <p className="text-sm text-gray-500">Mon-Fri: 9am - 5pm AEST</p>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  )
}