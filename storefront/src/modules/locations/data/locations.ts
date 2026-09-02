/**
 * Suburb landing pages surfaced at `/locations/[location]`.
 *
 * These target local search intent ("t shirt printing liverpool") where the
 * national players (The Print Bar, Colour Cartel, Garment Printing) don't
 * compete and the SERP is mostly directories — the cheapest ground we have.
 *
 * IMPORTANT — every entry must carry genuinely distinct copy. Google's
 * doorway-page policy penalises sets of near-identical location pages, so
 * `intro`, `serving` and `useCases` are per-suburb prose, not a template with
 * the suburb name swapped in. If you can't say something true and specific
 * about a suburb, don't add it — a smaller set of real pages outranks a big
 * set of thin ones.
 *
 * Travel times are measured from the Villawood studio (see STUDIO in
 * lib/util/seo). If the studio moves again, every `travel` value and any
 * `intro` that names the studio suburb has to be revisited — they're the
 * local-trust signal and a stale one reads as a business that doesn't know
 * where it is.
 *
 * Ordered roughly by search volume / commercial value within our catchment.
 */

export type LocationUseCase = {
  heading: string
  body: string
}

export type Location = {
  slug: string
  /** Suburb name as customers write it in search. */
  suburb: string
  postcode: string
  region: string
  /** Drive time from the Villawood studio — the local-trust signal. */
  travel: string
  /** <h1> and <title> lead. Keyword-first, suburb-anchored. */
  title: string
  /** Meta description. Keep ≤155 chars — see metaDescription() in lib/util/seo. */
  description: string
  intro: string
  serving: string
  useCases: LocationUseCase[]
  /** Nearby suburbs also served — internal link + areaServed schema. */
  nearby: string[]
}

export const locations: Location[] = [
  {
    slug: "villawood",
    suburb: "Villawood",
    postcode: "2163",
    region: "South West Sydney",
    travel: "our home suburb — walk-ins welcome",
    title: "Screen Printing & Embroidery Villawood",
    description:
      "SC Prints is a Villawood screen printer at 7 Epic Place. Screen print, DTF, DTG and embroidery in-house. Walk in, check a sample, collect in person.",
    intro:
      "This is our own patch. The studio is at 7 Epic Place, Villawood — a working print shop rather than a shopfront, so you can see the presses running, feel the difference between garment weights and check a print before committing to a full run.",
    serving:
      "Being in the Villawood industrial area puts us in the middle of our own customer base. A lot of our work comes from businesses within a few streets — manufacturing, transport, trade services and warehousing operations that need staff kitted out properly and re-ordered without fuss.",
    useCases: [
      {
        heading: "Walk in with an idea",
        body: "You don't need print-ready files. Bring a logo on your phone, a business card or a rough sketch and we'll tell you honestly whether it will print well, what it will cost, and what we'd change to make it better.",
      },
      {
        heading: "See the garment first",
        body: "Weight, cut and feel vary a lot between AS Colour, Gildan, Biz Collection and Syzmik. We keep samples on hand so you can compare them in person rather than guessing off a product photo.",
      },
      {
        heading: "Local trade and industry",
        body: "Hi-vis, work polos and embroidered jackets for the businesses around the Villawood estate. Close enough that a sample fitting is a five-minute errand rather than a courier round trip.",
      },
    ],
    nearby: ["Carramar", "Lansvale", "Chester Hill", "Fairfield East", "Yennora"],
  },
  {
    slug: "fairfield",
    suburb: "Fairfield",
    postcode: "2165",
    region: "South West Sydney",
    travel: "about 8 minutes from our Villawood studio",
    title: "Custom T-Shirt Printing Fairfield",
    description:
      "Screen printing, DTF and embroidery in Fairfield NSW. Team kits, club merch, uniforms and event tees from one garment. Local studio, no minimum order.",
    intro:
      "Our studio is a short run down Woodville Road from Fairfield, so these jobs are genuinely local — same-day quotes, real samples you can handle before you commit, and pickup rather than postage.",
    serving:
      "Fairfield's work is community-driven. A lot of what leaves our shop heads to junior sports clubs, school groups, church and cultural associations, and the small family businesses along the Ware Street and Smart Street strips.",
    useCases: [
      {
        heading: "Sports clubs and junior teams",
        body: "Training tees, hoodies and playing kit with numbers and player names. Screen printing gets the per-unit price down once a squad order passes fifty, and we can hold the artwork season to season so next year's order matches this year's exactly.",
      },
      {
        heading: "Schools and community groups",
        body: "Year 12 jerseys, camp shirts, fundraiser tees and volunteer polos. We'll work from a rough sketch or a phone photo if there's no artwork file — most school jobs arrive that way.",
      },
      {
        heading: "Events at the Showground",
        body: "Crew tees, stall uniforms and giveaway merch for Fairfield Showground events and community festivals. Tell us the event date and we'll work backwards to a production schedule that clears it.",
      },
    ],
    nearby: ["Fairfield East", "Canley Vale", "Yennora", "Villawood", "Smithfield"],
  },
  {
    slug: "liverpool",
    suburb: "Liverpool",
    postcode: "2170",
    region: "South West Sydney",
    travel: "about 15 minutes from our Villawood studio",
    title: "Custom Logo Embroidery & Printed Uniforms Liverpool",
    description:
      "Custom logo embroidery and printed uniforms for Liverpool NSW. Work polos, hi-vis, scrubs and business shirts, embroidered in-house. From one garment.",
    intro:
      "We embroider and print uniforms for Liverpool businesses out of our Villawood studio, a straight run down the Hume Highway. Your logo is digitised once and kept on file, so the first run and every top-up after it stitch out the same. Close enough that you can drop in, check a sample on the bench and pick your order up the same trip.",
    serving:
      "Liverpool is the commercial heart of South West Sydney, and the work reflects it: trade teams running out of the industrial pockets off Newbridge Road, allied-health and medical practices around the hospital precinct, and retail and food businesses through Westfield and the Macquarie Street mall.",
    useCases: [
      {
        heading: "Trade and construction crews",
        body: "Hi-vis polos, drill shirts and embroidered jackets in Syzmik, Bisley, Hard Yakka and JB's Wear. Logo embroidery holds up to site work and industrial laundering, and we keep your artwork on file so re-orders for new starters take one phone call.",
      },
      {
        heading: "Medical and allied health",
        body: "Embroidered scrubs, polos and tunics for practices around the Liverpool Hospital precinct. Discreet left-chest logos, staff names, and colour-coded tops so patients can tell roles apart at a glance.",
      },
      {
        heading: "Cafés, retail and hospitality",
        body: "Branded tees, aprons and caps for Liverpool CBD venues. Small runs are fine — we'll print from a single garment, so a new hire doesn't mean ordering another box of twenty.",
      },
    ],
    nearby: ["Casula", "Moorebank", "Warwick Farm", "Chipping Norton", "Prestons"],
  },
  {
    slug: "prestons",
    suburb: "Prestons",
    postcode: "2170",
    region: "South West Sydney",
    travel: "about 18 minutes from our Villawood studio",
    title: "Custom Printed Uniforms Prestons",
    description:
      "Custom printed and embroidered uniforms for Prestons NSW. Work polos, hi-vis, warehouse tees and embroidered jackets from a local South West Sydney studio.",
    intro:
      "Prestons sits at the M7 and M5 interchange, and most of what we send out here goes to the businesses built around that: warehousing and distribution along Bernera Road and Yarrunga Street, transport operators and the trades that service them. It's a short run down the Hume from our Villawood studio, so samples and pickup are a quick errand rather than a courier booking.",
    serving:
      "Uniform work in Prestons is mostly about crews. A depot or warehouse needs everyone in the same polo or hi-vis, in a spread of sizes, with a re-order path that doesn't involve re-supplying artwork or explaining the job again six months later.",
    useCases: [
      {
        heading: "Warehouse and logistics crews",
        body: "Printed tees and polos for pick-and-pack and dispatch teams, hi-vis for the yard. Sized runs with a few spares, and your artwork held on file so a new starter's shirt matches the rest of the floor.",
      },
      {
        heading: "Transport and fleet",
        body: "Embroidered work shirts and jackets for drivers, with a company name that survives daily wear and hot washes. Embroidery is the better choice here — print on a jacket that lives in a truck cab fades faster than the vehicle does.",
      },
      {
        heading: "Trades around the estate",
        body: "Work polos, drill shirts and hi-vis in Syzmik, Bisley, Hard Yakka and JB's Wear for the electricians, mechanics and fit-out crews servicing the industrial blocks. From a single garment, bulk pricing as the run grows.",
      },
    ],
    nearby: ["Edmondson Park", "Hoxton Park", "Lurnea", "Casula", "Miller"],
  },
  {
    slug: "chipping-norton",
    suburb: "Chipping Norton",
    postcode: "2170",
    region: "South West Sydney",
    travel: "about 12 minutes from our Villawood studio",
    title: "Custom Uniforms & Embroidery Chipping Norton",
    description:
      "Custom designed uniforms, embroidery and printing for Chipping Norton NSW. Staff polos, club kit and workwear. Villawood studio, from a single garment.",
    intro:
      "Chipping Norton is one of the closest suburbs to our Villawood studio — across the Georges River and a few minutes down Newbridge Road. Jobs here tend to be smaller and more personal than the industrial estates further west: a family business, a local club, a school group, a café on the water.",
    serving:
      "The suburb is mostly residential around the lakes, with a working pocket along Governor Macquarie Drive and the businesses that front Newbridge Road. That mix shows up in what we make: embroidered polos for a handful of staff, playing kit for junior teams that train at the local ovals, and printed tees for community events by the river.",
    useCases: [
      {
        heading: "Design a uniform from scratch",
        body: "If you don't have a uniform yet, we'll help you build one — pick the garment, choose print or embroidery, set logo size and placement, and see a sample before you commit. Most small businesses arrive with a logo on a phone and nothing else, and that's a fine starting point.",
      },
      {
        heading: "Clubs and junior sport",
        body: "Training tees, hoodies and playing kit with sponsor logos and player numbers. We hold the artwork season to season so next year's order matches this year's without anyone digging out old files.",
      },
      {
        heading: "Small teams, small runs",
        body: "A café, a clinic or a tradie with two apprentices doesn't need to order twenty of anything. We print and embroider from one garment, so you can add a shirt for a new hire instead of carrying stock in sizes nobody wears.",
      },
    ],
    nearby: ["Moorebank", "Liverpool", "Warwick Farm", "Lansvale", "Milperra"],
  },
  {
    slug: "bankstown",
    suburb: "Bankstown",
    postcode: "2200",
    region: "South West Sydney",
    travel: "about 12 minutes from our Villawood studio",
    title: "Custom Printed Uniforms & Embroidery Bankstown",
    description:
      "Custom printed uniforms and logo embroidery for Bankstown NSW. Staff polos, business shirts, club kit and workwear. Studio 12 minutes away, no minimums.",
    intro:
      "Bankstown is one of our closest markets — a short run across from Villawood — so a printed or embroidered uniform order is usually a pickup rather than a freight job, and a sample can be in your hands the same day you ask for one.",
    serving:
      "Between the sporting precinct, the airport and industrial pockets, and the CBD's professional and retail businesses, Bankstown jobs range from fifty-shirt club runs to a dozen embroidered polos for an office.",
    useCases: [
      {
        heading: "Clubs and sporting groups",
        body: "Playing kit, supporter tees and club hoodies with sponsor logos. Multi-sponsor layouts are routine — send us the logo pack and we'll set out placements that keep everyone visible.",
      },
      {
        heading: "Office and corporate uniforms",
        body: "Embroidered business shirts, polos and knitwear in Biz Collection and Biz Corporates. Subtle left-chest branding, consistent across sizes and cuts so the team reads as one.",
      },
      {
        heading: "Trades and services",
        body: "Work polos, tees and jackets for mobile trades operating out of Bankstown and Milperra. Add a back print with your phone number and the uniform starts paying for itself.",
      },
    ],
    nearby: ["Yagoona", "Chester Hill", "Birrong", "Milperra", "Georges Hall"],
  },
  {
    slug: "cabramatta",
    suburb: "Cabramatta",
    postcode: "2166",
    region: "South West Sydney",
    travel: "about 12 minutes from our Villawood studio",
    title: "T-Shirt Printing & Embroidery Cabramatta",
    description:
      "Custom printing and embroidery for Cabramatta NSW. Restaurant uniforms, aprons, retail staff tees and event merch. Local studio, from a single unit.",
    intro:
      "Cabramatta is a short drive from our Villawood studio, and it's one of the areas we print for most. Most jobs here start with a quick conversation about what the garment actually has to survive — heat, grease, long shifts and constant washing.",
    serving:
      "The John Street and Park Road precinct is one of the densest hospitality and retail strips in Sydney, and that's most of what we print here: restaurant and café uniforms, bakery and grocer aprons, and staff tees for shops that turn over crew often enough to need small top-up runs.",
    useCases: [
      {
        heading: "Restaurants and cafés",
        body: "Aprons, service tees, caps and embroidered polos built for hot kitchens and long shifts. We'll match your signage colours so the front-of-house look holds together.",
      },
      {
        heading: "Retail and grocers",
        body: "Staff polos and tees in small runs. No minimum means you can add two shirts for a new starter instead of carrying dead stock in sizes nobody wears.",
      },
      {
        heading: "Festivals and cultural events",
        body: "Volunteer and crew shirts for Moon Festival and community events around the precinct. Multi-colour prints, bilingual artwork and name-per-shirt runs are all standard work for us.",
      },
    ],
    nearby: ["Canley Vale", "Lansvale", "Bonnyrigg", "St Johns Park", "Mount Pritchard"],
  },
  {
    slug: "wetherill-park",
    suburb: "Wetherill Park",
    postcode: "2164",
    region: "Western Sydney",
    travel: "about 17 minutes from our Villawood studio",
    title: "Custom Workwear & Uniforms Wetherill Park",
    description:
      "Custom workwear, hi-vis and embroidered uniforms for Wetherill Park NSW. Syzmik, Bisley, Hard Yakka, JB's Wear. Bulk pricing, fast local turnaround.",
    intro:
      "Wetherill Park and the surrounding industrial estate is workwear country, and that's most of what we send out here — hi-vis, drill shirts and embroidered jackets for businesses that need staff kitted out properly rather than cheaply.",
    serving:
      "The estate runs on manufacturing, logistics, transport and trade services, and the uniform requirements that come with them: compliant hi-vis, garments that survive industrial laundering, and re-orders that arrive matching the ones bought eighteen months ago.",
    useCases: [
      {
        heading: "Hi-vis and compliant workwear",
        body: "Day and day/night hi-vis polos, drill shirts and vests in Syzmik, Bisley and JB's Wear. Reflective tape placement is kept clear of your logo so compliance isn't compromised by the branding.",
      },
      {
        heading: "Embroidery that lasts",
        body: "Embroidered logos outlast print on workwear, full stop — they survive hot washes, high-vis laundering and daily abrasion. We digitise your logo once and keep the file, so every future order stitches out identically.",
      },
      {
        heading: "Staged bulk orders",
        body: "Fit out the whole crew at bulk pricing, then top up as people join. We hold your artwork and digitised file, so a two-shirt re-order matches the original run without a new setup charge.",
      },
    ],
    nearby: ["Smithfield", "Prairiewood", "Bossley Park", "Yennora", "Fairfield East"],
  },
  {
    slug: "parramatta",
    suburb: "Parramatta",
    postcode: "2150",
    region: "Greater Western Sydney",
    travel: "about 20 minutes from our Villawood studio",
    title: "Corporate Uniforms & Custom Printing Parramatta",
    description:
      "Embroidered corporate uniforms and custom printing for Parramatta NSW. Business shirts, polos, event merch. Western Sydney studio, Australia-wide shipping.",
    intro:
      "Parramatta is Sydney's second CBD and the work has a different shape to our South West jobs — more corporate uniform programs, more conference and event merch, and more brands that need everything to stay consistent across multiple offices.",
    serving:
      "We print and embroider for professional services firms, property and construction groups, government-adjacent organisations and the events that run through the Parramatta CBD and Rosehill precincts.",
    useCases: [
      {
        heading: "Corporate uniform programs",
        body: "Embroidered business shirts, polos, vests and knitwear across a full team. We keep a per-client spec — thread colours, logo size, placement — so a re-order in twelve months matches what's already in the wardrobe.",
      },
      {
        heading: "Conference and event merch",
        body: "Delegate tees, staff polos, tote bags and caps for events at the convention and stadium precincts. Delivery direct to venue, packed and labelled by size if it helps your setup crew.",
      },
      {
        heading: "Property and construction",
        body: "Site hi-vis, embroidered jackets and branded polos for development and project teams. Hi-vis compliance for site work, smarter corporate pieces for client-facing staff.",
      },
    ],
    nearby: ["Granville", "Merrylands", "Harris Park", "Westmead", "Auburn"],
  },
]

export const getLocation = (slug: string): Location | undefined =>
  locations.find((l) => l.slug === slug)
