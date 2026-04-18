import { Metadata } from "next"
import ContactForm from "@modules/contact/components/contact-form"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with our team.",
}

export default function ContactPage() {
  return (
    <div className="content-container py-14 small:py-20">
      {/* Header Section */}
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight text-ui-fg-base">
          Contact Us
        </h1>
        <p className="mt-4 text-lg text-ui-fg-subtle">
          Have a question about our products or your order? We're here to help.
        </p>

        {/* FAQ Banner */}
        <div className="mt-6 inline-flex items-center justify-center rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 text-sm text-ui-fg-subtle">
          <span className="mr-2">💡 Need an instant answer?</span>
          <LocalizedClientLink
            href="/faq"
            className="font-semibold text-[var(--brand-secondary)] hover:text-[var(--brand-accent)] hover:underline"
          >
            Check our Frequently Asked Questions
          </LocalizedClientLink>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 items-start gap-12 md:grid-cols-2 lg:gap-16">
        {/* LEFT COLUMN: Contact Form */}
        <ContactForm />

        {/* RIGHT COLUMN: Map + Store Hours */}
        <div className="flex flex-col gap-6">
          <div className="relative h-[400px] w-full overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-subtle shadow-sm group">
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

          <div className="rounded-xl border border-ui-border-base bg-ui-bg-subtle p-6 text-center">
            <h3 className="mb-1 font-bold text-ui-fg-base">Store Hours</h3>
            <p className="text-sm text-[var(--brand-secondary)]">
              Monday - Friday: 9:00am - 5:00pm AEST
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}