import { Metadata } from "next"
import Link from "next/link"

import ContactForm from "@modules/contact/components/contact-form"

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with our team.",
}

export default function ContactPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
      {/* Header Section */}
      <div className="max-w-2xl mx-auto text-center mb-12">
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
          Contact Us
        </h1>
        <p className="mt-4 text-lg text-gray-500">
          Have a question about our products or your order? We're here to help.
        </p>

        {/* FAQ Banner */}
        <div className="mt-6 inline-flex items-center justify-center p-4 bg-gray-50 rounded-lg border border-gray-100 text-sm text-gray-600">
          <span className="mr-2">💡 Need an instant answer?</span>
          <Link
            href="/faq"
            className="font-semibold text-gray-900 hover:underline"
          >
            Check our Frequently Asked Questions
          </Link>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16 items-start">
        {/* LEFT COLUMN: Contact Form */}
        <ContactForm />

        {/* RIGHT COLUMN: Map + Store Hours */}
        <div className="flex flex-col gap-6">
          <div className="h-[400px] w-full bg-gray-100 rounded-2xl overflow-hidden shadow-sm border border-gray-200 relative group">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d26545.626463999554!2d150.91617260565882!3d-33.89602410887372!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x6b12beabf0b5d84b%3A0x5017d681632ad40!2sCabramatta%20NSW%202166!5e0!3m2!1sen!2sau!4v1713259868726!5m2!1sen!2sau"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="absolute inset-0 grayscale contrast-125 opacity-90 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500"
            />
          </div>

          <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 text-center">
            <h3 className="font-bold text-gray-900 mb-1">Store Hours</h3>
            <p className="text-sm text-[var(--brand-secondary)]">
              Monday - Friday: 9:00am - 5:00pm AEST
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}