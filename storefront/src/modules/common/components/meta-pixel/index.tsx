import Script from "next/script"

/**
 * Injects the Meta (Facebook) Pixel base script + a single PageView.
 * Renders nothing if NEXT_PUBLIC_FB_PIXEL_ID isn't set, so dev/previews
 * without the env var stay quiet — same pattern as Ga4Script.
 *
 * Conversion events (ViewContent, AddToCart, InitiateCheckout, Purchase,
 * Search) are fired by the existing @lib/analytics trackers via
 * `window.fbq`; this just bootstraps fbq so those calls land. Purchase is
 * ALSO sent server-side (Conversions API, /api/meta-capi) sharing an
 * event_id so Meta deduplicates the two.
 *
 * ponytail: PageView fires once on load, not per SPA route change — matches
 * the GA4 setup, which doesn't do SPA pageviews either. Ad optimisation
 * runs on the conversion events, not on pageview granularity.
 */
export const MetaPixel = () => {
  const pixelId = process.env.NEXT_PUBLIC_FB_PIXEL_ID
  if (!pixelId) return null

  return (
    <>
      <Script id="meta-pixel-init" strategy="afterInteractive">
        {`
          !function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window,document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('init', '${pixelId}');
          fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  )
}
