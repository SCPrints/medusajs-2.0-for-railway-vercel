/**
 * Suburb + city landing pages surfaced at `/locations/[location]`.
 * (City entries — `kind: "city"` — follow the suburbs; see the note there.)
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
  /** "city" = Sydney-wide / interstate page; absent = suburb in our catchment. */
  kind?: "city"
  /** State for areaServed schema. Defaults to the studio's state (NSW). */
  state?: string
  /** Suburb (or city) name as customers write it in search. */
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
      "Screen printing, DTF and embroidery in Villawood, from 1 garment with no minimum. Walk in to 7 Epic Place, check a sample, collect in person.",
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
      "Custom t-shirt printing and embroidery 8 min from Fairfield. From 1 garment, no minimum, free design proof, pickup from our Villawood studio.",
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
      "Logo embroidery and printed uniforms for Liverpool, 15 min from our Villawood studio. From 1 garment, no minimum. Digitised once, re-orders match.",
    intro:
      "We embroider and print uniforms for Liverpool businesses out of our Villawood studio, a straight run down the Hume Highway. Your logo is digitised once and kept on file, so the first run and every top-up after it stitch out the same. Close enough that you can drop in, check a sample on the bench and pick your order up the same trip.",
    serving:
      "Liverpool is the commercial heart of South West Sydney, and the work reflects it: trade teams running out of the industrial pockets off Newbridge Road, allied-health and medical practices around the hospital precinct, and retail and food businesses through Westfield and the Macquarie Street mall.",
    useCases: [
      {
        heading: "Logo embroidery, start to finish",
        body: "Send the logo you have — a PDF, a phone photo, an old shirt. We digitise it once, stitch a sample you approve before the run, and keep the file so every future top-up matches. Standard turnaround is 7–10 business days, from a single polo up to a whole crew, with bulk pricing as the run grows.",
      },
      {
        heading: "Trade, construction and medical",
        body: "Hi-vis polos, drill shirts and embroidered jackets in Syzmik, Bisley, Hard Yakka and JB's Wear for site crews; embroidered scrubs, polos and tunics for practices around the Liverpool Hospital precinct. Embroidery outlasts print through industrial laundering, and re-orders for new starters take one phone call.",
      },
      {
        heading: "Cafés, retail and hospitality",
        body: "Branded tees, aprons and caps for Liverpool CBD venues. Small runs are fine — we'll print or embroider from a single garment, so a new hire doesn't mean ordering another box of twenty.",
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
      "Printed and embroidered uniforms for Prestons businesses. From 1 garment, no minimum, bulk pricing as the run grows. Pickup 18 min away in Villawood.",
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
      "Custom uniforms, embroidery and printing 12 min from Chipping Norton. From 1 garment, no minimum, free design proof, pickup from Villawood.",
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
      "Custom printed uniforms and embroidery 12 min from Bankstown. From 1 garment, no minimum, free design proof, same-day samples, pickup from Villawood.",
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
      "Restaurant uniforms, aprons and staff tees printed 12 min from Cabramatta. From 1 garment, no minimum, free design proof, pickup from Villawood.",
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
      "Hi-vis, workwear and embroidered uniforms for Wetherill Park. Syzmik, Bisley, Hard Yakka. From 1 garment, bulk pricing, pickup 17 min away in Villawood.",
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
      "Embroidered corporate uniforms and custom printing for Parramatta. From 1 garment, no minimum, free design proof, 20 min from our Villawood studio.",
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

  // ── City pages ─────────────────────────────────────────────────────────
  // Sydney-wide + interstate/regional intent ("t shirt printing melbourne").
  // Outside Sydney we have no local presence, so the copy is about how
  // ordering from a Sydney studio works for that city and what garments suit
  // its climate and industries — never claimed local customers, never invented
  // transit times. Add a real customer example or measured delivery time to an
  // entry when you have one; that is what will lift it above the directories.
  {
    slug: "sydney",
    kind: "city",
    suburb: "Sydney",
    postcode: "2000",
    region: "Greater Sydney",
    travel:
      "collect Monday to Friday, or have it delivered anywhere in Sydney",
    title: "Custom T-Shirt Printing & Embroidery Sydney",
    description:
      "Sydney screen printing, DTF and embroidery from 1 garment, no minimum. Printed in-house in Villawood — pick up or delivered across Sydney.",
    intro:
      "We're a working Sydney print studio at 7 Epic Place, Villawood, with screen printing, DTF transfers, embroidery and UV DTF under one roof. Design it online and have it delivered anywhere in Sydney, or come out to the studio, handle the garments and collect in person.",
    serving:
      "Sydney jobs cover the whole range: a single printed tee for a birthday, twenty embroidered polos for a new café in the Inner West, a few hundred screen-printed shirts for a festival crew, or a staged uniform rollout across several sites. There's no minimum on DTF print or embroidery; screen printing starts at 25 pieces and gets cheaper per shirt as the run grows.",
    useCases: [
      {
        heading: "Business uniforms and workwear",
        body: "Embroidered polos, business shirts, hi-vis and jackets in Biz Collection, Syzmik, Bisley, Hard Yakka, JB's Wear and AS Colour. Your logo is digitised once and kept on file, so a top-up for a new starter matches the original run.",
      },
      {
        heading: "Brands, merch and events",
        body: "Heavyweight tees and hoodies for labels and bands, crew shirts and giveaway merch for events. DTF makes a small first run affordable while you test a design; screen printing takes over once the numbers climb.",
      },
      {
        heading: "Clubs, schools and teams",
        body: "Playing kit, training tees, Year 12 jerseys and club hoodies with names and numbers. Set up a group order and each player or parent enters their own size, so nobody is chasing a spreadsheet.",
      },
    ],
    nearby: [
      "Sydney CBD",
      "Inner West",
      "Eastern Suburbs",
      "North Shore",
      "Northern Beaches",
      "Sutherland Shire",
      "Western Sydney",
    ],
  },
  {
    slug: "melbourne",
    kind: "city",
    state: "VIC",
    suburb: "Melbourne",
    postcode: "3000",
    region: "Victoria",
    travel: "every Melbourne order is printed here and shipped to your door",
    title: "Custom T-Shirt Printing & Merch Melbourne",
    description:
      "Custom t-shirt printing, embroidery and merch shipped to Melbourne. From 1 garment, no minimum, free design proof, live pricing online.",
    intro:
      "You don't need a printer down the road to get a job done properly. Melbourne orders are designed online, proofed online and printed in our Sydney studio, then shipped to your door. You see the price as you build the order and approve a mockup before anything goes to press.",
    serving:
      "Melbourne suits the heavier end of the catalogue: heavyweight and oversized tees, hoodies and crews that layer through a cold snap, and garments that look like retail rather than a giveaway. If you're ordering for a venue, a label or an event, that's the range to start in.",
    useCases: [
      {
        heading: "Labels, bands and merch",
        body: "Heavyweight blanks from AS Colour and Shaka Wear, printed from a single piece. Run a small DTF batch to test a design, then move to screen printing at fifty-plus when it sells.",
      },
      {
        heading: "Cafés, bars and venues",
        body: "Aprons, tees and embroidered caps for front-of-house teams. No minimum means a new hire is one more shirt, not another box of twenty.",
      },
      {
        heading: "Offices and events",
        body: "Embroidered polos and knitwear for teams, delegate tees and tote bags for conferences. Tell us the event date when you enquire and we'll confirm whether production plus freight clears it.",
      },
    ],
    nearby: ["Richmond", "Brunswick", "Collingwood", "Footscray", "St Kilda", "Dandenong"],
  },
  {
    slug: "brisbane",
    kind: "city",
    state: "QLD",
    suburb: "Brisbane",
    postcode: "4000",
    region: "Queensland",
    travel: "every Brisbane order is printed here and shipped to your door",
    title: "Custom T-Shirt Printing & Uniforms Brisbane",
    description:
      "Custom t-shirt printing and embroidered uniforms shipped to Brisbane. From 1 garment, no minimum, lightweight fabrics, free design proof.",
    intro:
      "Brisbane orders are built online and printed in our Sydney studio before being shipped north. The whole job runs through the site: pick the garment, upload a logo, see the price, approve the proof. Queensland doesn't observe daylight saving, so in summer our phones run an hour ahead of you; email and the online proof never close.",
    serving:
      "Humidity decides most garment choices in Brisbane. Lightweight cotton tees, breathable polos and moisture-wicking activewear are comfortable for a full shift; a heavy fleece or a large solid print across the chest is not. We'll steer you to the right weight if you tell us where the garment will be worn.",
    useCases: [
      {
        heading: "Breathable team uniforms",
        body: "Lightweight polos and tees in Biz Collection, Aussie Pacific and AS Colour, with a left-chest embroidered logo that adds almost no weight. Good for hospitality, retail and office teams working through a Queensland summer.",
      },
      {
        heading: "Trades and construction",
        body: "Hi-vis polos, drill shirts and vests in Syzmik, Bisley and Hard Yakka, including vented and lightweight styles made for heat. Branding is placed clear of the reflective tape.",
      },
      {
        heading: "Schools and sports clubs",
        body: "Training tees, playing kit and supporter gear with names and numbers. A group order link lets every family enter their own sizes, and the artwork stays on file for next season.",
      },
    ],
    nearby: ["Fortitude Valley", "South Brisbane", "Chermside", "Ipswich", "Logan"],
  },
  {
    slug: "perth",
    kind: "city",
    state: "WA",
    suburb: "Perth",
    postcode: "6000",
    region: "Western Australia",
    travel: "every Perth order is printed here and freighted across to WA",
    title: "Custom Workwear & Printed Uniforms Perth",
    description:
      "Hi-vis workwear, embroidered uniforms and custom printing shipped to Perth. From 1 garment, bulk pricing, proofs approved online.",
    intro:
      "Perth is the longest freight run we do, so the honest advice is to plan around it: order a little earlier than you would locally, and order enough in one go that you aren't paying to cross the country twice. Everything else works the same as for a Sydney customer. You design, price and approve the job online and we print it in our own studio.",
    serving:
      "Sydney is two hours ahead of Perth, three during daylight saving, so our 9 to 4 is roughly 7 to 2 your time in winter and 6 to 1 in summer. The online proof and order tracker are built for exactly that gap: you approve artwork and follow production from your account without needing to catch us on the phone.",
    useCases: [
      {
        heading: "Mining, resources and site crews",
        body: "Day/night hi-vis shirts, drill and embroidered jackets in Syzmik, Bisley, Hard Yakka and JB's Wear. Embroidery holds up to industrial laundering far better than print, which matters for gear that is washed hot every swing.",
      },
      {
        heading: "One freight run, staged sizes",
        body: "Fit out the whole crew at bulk pricing with a few spares in common sizes. We keep the digitised logo on file, so a later top-up matches without a new setup charge.",
      },
      {
        heading: "Small business and hospitality",
        body: "Printed tees, aprons and embroidered polos from a single garment. Worth combining with anything else you need printed so it all travels in one carton.",
      },
    ],
    nearby: ["Fremantle", "Joondalup", "Osborne Park", "Welshpool", "Rockingham", "Midland"],
  },
  {
    slug: "adelaide",
    kind: "city",
    state: "SA",
    suburb: "Adelaide",
    postcode: "5000",
    region: "South Australia",
    travel: "every Adelaide order is printed here and shipped to your door",
    title: "Custom Printed Uniforms & Embroidery Adelaide",
    description:
      "Embroidered uniforms, event tees and custom printing shipped to Adelaide. From 1 garment, no minimum, free design proof, live pricing.",
    intro:
      "Adelaide orders are placed online and printed in our Sydney studio. You're only ever half an hour behind us on the clock, so a phone call during business hours works as well as it would locally, and the proof, pricing and order tracking all live in your account.",
    serving:
      "Adelaide's calendar is unusually event-heavy, with festival season packing a year's worth of crew shirts and merch into a few weeks. Outside that, the steady work is uniforms: cellar-door and hospitality teams, trades, and offices that want a consistent embroidered logo across every cut and size.",
    useCases: [
      {
        heading: "Festival and event season",
        body: "Crew tees, volunteer shirts and merch for the late-summer festival run. It's a compressed season, so lock artwork early; send us the event date and we'll tell you the last safe day to approve the proof.",
      },
      {
        heading: "Cellar doors and hospitality",
        body: "Embroidered polos, aprons and caps that look the part in front of customers. Small runs are fine, which suits venues that staff up for vintage and weekends.",
      },
      {
        heading: "Trades and industry",
        body: "Hi-vis, work polos and embroidered jackets in Syzmik, Bisley and Hard Yakka, with your logo kept on file so re-orders stitch out identically.",
      },
    ],
    nearby: ["Port Adelaide", "Glenelg", "Norwood", "Salisbury", "Mount Barker"],
  },
  {
    slug: "canberra",
    kind: "city",
    state: "ACT",
    suburb: "Canberra",
    postcode: "2601",
    region: "Australian Capital Territory",
    travel: "every Canberra order is printed here and sent down the Hume",
    title: "Custom T-Shirt Printing & Embroidery Canberra",
    description:
      "Custom printing and embroidered uniforms shipped to Canberra from Sydney. From 1 garment, no minimum, free design proof, quotes for organisations.",
    intro:
      "Canberra is a short freight run down the Hume Highway from our Sydney studio, which makes it one of the easier places for us to supply. Order through the site with live pricing, or ask for a formal written quote if your organisation needs one before it can raise a purchase order.",
    serving:
      "A lot of Canberra buying is done by committees: associations, clubs, university halls and workplaces that need a quote on paper, an approved proof and an invoice that matches. Our quote and proof-approval flow is set up for that, with a link you can forward to whoever signs off.",
    useCases: [
      {
        heading: "Associations and conferences",
        body: "Delegate tees, staff polos, tote bags and caps. Send the event date with your enquiry and we'll confirm production and freight clear it before you commit.",
      },
      {
        heading: "University halls and student groups",
        body: "Hall jerseys, society hoodies and O-Week shirts with individual names. A group order link collects every size and name without anyone managing a spreadsheet.",
      },
      {
        heading: "Winter teamwear",
        body: "Canberra winters call for fleece: embroidered hoodies, quarter zips, soft-shell jackets and beanies for clubs and outdoor crews, alongside the usual polos.",
      },
    ],
    nearby: ["Civic", "Belconnen", "Woden", "Tuggeranong", "Gungahlin", "Fyshwick"],
  },
  {
    slug: "hobart",
    kind: "city",
    state: "TAS",
    suburb: "Hobart",
    postcode: "7000",
    region: "Tasmania",
    travel: "every Hobart order is printed here and shipped across Bass Strait",
    title: "Custom Hoodies, Printing & Embroidery Hobart",
    description:
      "Custom hoodies, embroidered jackets and printed tees shipped to Hobart. From 1 garment, no minimum, free design proof, live pricing online.",
    intro:
      "Tasmanian orders are printed in our Sydney studio and shipped across Bass Strait. That crossing adds time compared with a mainland delivery, so build in a buffer if you're working to a date. The ordering itself is all online: choose the garment, upload artwork, approve the proof.",
    serving:
      "Hobart is cold-weather country for most of the year, and the garments that earn their keep there are warm ones. Hoodies, crews, fleece and jackets take embroidery well, and a stitched logo on a jacket or beanie outlasts a print through years of wear.",
    useCases: [
      {
        heading: "Hoodies, fleece and jackets",
        body: "Heavyweight hoodies and crews from AS Colour and Gildan, soft-shell and puffer jackets with an embroidered chest logo. Puffer jackets are embroidery-only; we'll tell you which decoration suits each garment.",
      },
      {
        heading: "Beanies and headwear",
        body: "Embroidered beanies and caps for outdoor crews, markets and hospitality. Small logos stitch cleanly; we'll simplify fine detail at proof stage so it reads at that size.",
      },
      {
        heading: "Tourism and hospitality teams",
        body: "Staff tees, polos and aprons for venues and tour operators, from a single garment so seasonal hires can be added one at a time.",
      },
    ],
    nearby: ["Glenorchy", "Kingston", "Sandy Bay", "Moonah", "Rosny Park"],
  },
  {
    slug: "darwin",
    kind: "city",
    state: "NT",
    suburb: "Darwin",
    postcode: "0800",
    region: "Northern Territory",
    travel: "every Darwin order is printed here and freighted to the Top End",
    title: "Custom Workwear & T-Shirt Printing Darwin",
    description:
      "Lightweight workwear, hi-vis and custom t-shirt printing shipped to Darwin. From 1 garment, no minimum, proofs approved online.",
    intro:
      "Darwin is a long way from any large print shop, so most Top End businesses already order remotely. Ours runs through the website: live pricing, an online proof you approve before production, and an order page that shows which stage the job is at. Allow extra freight time and order ahead of the date you need it.",
    serving:
      "Heat and humidity rule the garment choice. Lightweight, breathable and quick-drying fabrics are the only sensible option through the build-up and the wet, and a small embroidered or left-chest logo wears far cooler than a large solid print across the back.",
    useCases: [
      {
        heading: "Hot-climate workwear",
        body: "Vented and lightweight hi-vis shirts, cotton drill and breathable polos in Syzmik, Bisley and JB's Wear. Embroidery survives the constant washing that Top End workwear gets.",
      },
      {
        heading: "Tourism and hospitality",
        body: "Crew shirts and polos for tour operators, venues and market stalls gearing up for the dry season. Order before the season starts so freight isn't the thing that holds you up.",
      },
      {
        heading: "Clubs and social teams",
        body: "Lightweight tees and singlets for sports clubs, workplace social clubs and unit teams, printed from one piece with names and numbers if you want them.",
      },
    ],
    nearby: ["Palmerston", "Winnellie", "Casuarina", "Berrimah", "Parap"],
  },
  {
    slug: "newcastle",
    kind: "city",
    suburb: "Newcastle",
    postcode: "2300",
    region: "Hunter, New South Wales",
    travel: "about two hours down the motorway from Newcastle, or shipped to your door",
    title: "Custom T-Shirt Printing & Embroidery Newcastle",
    description:
      "Custom t-shirt printing, embroidery and workwear for Newcastle and the Hunter. From 1 garment, no minimum, free proof, shipped from Sydney.",
    intro:
      "Newcastle is close enough to our Sydney studio that you have a choice: have the order shipped up, or drive down, see the garments in person and collect. Either way the job is printed in-house, and you approve a proof before it runs.",
    serving:
      "The Hunter has two very different kinds of buyer. One is industrial: port, mining-services and manufacturing crews who need compliant hi-vis that survives hot washing. The other is the city itself, with its surf and skate labels, venues and university groups ordering tees and hoodies in small runs.",
    useCases: [
      {
        heading: "Industrial and mining services",
        body: "Day/night hi-vis, drill shirts and embroidered jackets in Syzmik, Bisley, Hard Yakka and JB's Wear. Logos are placed clear of reflective tape and kept on file for re-orders.",
      },
      {
        heading: "Local labels and venues",
        body: "Heavyweight tees and hoodies printed from a single piece, so a small label can test a design without committing to a carton. Staff tees and aprons for bars and cafés work the same way.",
      },
      {
        heading: "Clubs and uni groups",
        body: "Surf club, football and society gear with names and numbers. A group order link lets every member enter their own size.",
      },
    ],
    nearby: ["Hamilton", "Charlestown", "Mayfield", "Maitland", "Lake Macquarie"],
  },
  {
    slug: "wollongong",
    kind: "city",
    suburb: "Wollongong",
    postcode: "2500",
    region: "Illawarra, New South Wales",
    travel: "a bit over an hour's drive from Wollongong, or shipped to your door",
    title: "Custom Printing & Embroidered Uniforms Wollongong",
    description:
      "Embroidered uniforms, workwear and custom printing for Wollongong and the Illawarra. From 1 garment, no minimum, free design proof.",
    intro:
      "Our studio is in Sydney's south west, on the Wollongong side of the city, so the Illawarra is one of the nearer places we supply outside Sydney. Orders can be shipped down, or you can drive up, check a sample and collect.",
    serving:
      "Wollongong's work splits between heavy industry around Port Kembla, the university, and a coastline of small businesses and surf clubs. That means everything from compliant site gear to a dozen embroidered polos for a café.",
    useCases: [
      {
        heading: "Industrial and site uniforms",
        body: "Hi-vis, drill and embroidered jackets for steel, port and construction crews. Embroidery is the durable choice for garments that get industrial laundering.",
      },
      {
        heading: "Surf clubs and junior sport",
        body: "Club tees, hoodies and singlets with sponsor logos. We hold the artwork season to season so next year's order matches.",
      },
      {
        heading: "Small business uniforms",
        body: "Embroidered polos, aprons and caps from one garment, so adding a staff member doesn't mean a minimum order.",
      },
    ],
    nearby: ["Port Kembla", "Shellharbour", "Fairy Meadow", "Dapto", "Unanderra"],
  },
  {
    slug: "central-coast",
    kind: "city",
    suburb: "Central Coast",
    postcode: "2250",
    region: "New South Wales",
    travel: "around an hour and a half from Gosford, or shipped to your door",
    title: "Custom T-Shirt Printing & Uniforms Central Coast",
    description:
      "Custom t-shirt printing and embroidered uniforms for the Central Coast. From 1 garment, no minimum, free design proof, shipped from Sydney.",
    intro:
      "Central Coast orders are printed at our Sydney studio and shipped up the M1. If you'd rather see garments before you choose, the studio is a drive away and open Monday to Friday.",
    serving:
      "The Coast runs on small operators: trades working between Gosford and Wyong, cafés and shops in the beach towns, and a long list of surf lifesaving and junior sports clubs. Most of them need a handful of garments at a time, which is exactly what a no-minimum printer is for.",
    useCases: [
      {
        heading: "Tradies and mobile businesses",
        body: "Work polos, hi-vis and embroidered jackets, with a back print carrying your name and number if you want the uniform to do some advertising.",
      },
      {
        heading: "Surf and sports clubs",
        body: "Club tees, hoodies and playing kit with names and numbers. A group order link collects sizes straight from members.",
      },
      {
        heading: "Cafés and retail",
        body: "Aprons, tees and caps in small runs, re-ordered one or two at a time as staff change.",
      },
    ],
    nearby: ["Gosford", "Erina", "Tuggerah", "Wyong", "Terrigal"],
  },
  {
    slug: "gold-coast",
    kind: "city",
    state: "QLD",
    suburb: "Gold Coast",
    postcode: "4217",
    region: "Queensland",
    travel: "every Gold Coast order is printed here and shipped to your door",
    title: "Custom T-Shirt Printing & Uniforms Gold Coast",
    description:
      "Custom t-shirt printing, staff uniforms and embroidery shipped to the Gold Coast. From 1 garment, no minimum, free design proof.",
    intro:
      "Gold Coast orders are designed and approved online, printed in our Sydney studio and shipped north. There's no minimum, so a business that hires for the season can add shirts as the roster grows.",
    serving:
      "Staffing on the Gold Coast moves with the tourist calendar, and uniforms have to keep up. Venues, tour and hire operators, gyms and surf clubs all need garments that are light enough for the climate and available in ones and twos when a new person starts.",
    useCases: [
      {
        heading: "Hospitality and tourism staff",
        body: "Breathable polos, tees and caps with an embroidered or printed logo. Top up a single shirt at a time through the holiday peaks.",
      },
      {
        heading: "Gyms and fitness brands",
        body: "Activewear tees, singlets and hoodies printed with your brand, in small runs you can sell at the front desk and re-order when a size runs out.",
      },
      {
        heading: "Surf clubs and events",
        body: "Club gear, crew tees and event merch. Give us the date and we'll confirm production plus freight will clear it.",
      },
    ],
    nearby: ["Surfers Paradise", "Burleigh Heads", "Southport", "Robina", "Coolangatta"],
  },
  {
    slug: "sunshine-coast",
    kind: "city",
    state: "QLD",
    suburb: "Sunshine Coast",
    postcode: "4558",
    region: "Queensland",
    travel: "every Sunshine Coast order is printed here and shipped to your door",
    title: "Custom T-Shirt Printing & Embroidery Sunshine Coast",
    description:
      "Small-run custom t-shirt printing and embroidery shipped to the Sunshine Coast. From 1 garment, no minimum, free design proof.",
    intro:
      "Sunshine Coast orders are built on the website and printed in our Sydney studio. Because there's no minimum, it works for businesses that are small on purpose: you order what you need this month and come back for more.",
    serving:
      "The Coast is full of owner-run businesses and market-stall labels, from Caloundra up to Noosa. They tend to want retail-quality garments in small quantities, and a printer who won't push them into a carton of fifty.",
    useCases: [
      {
        heading: "Market and boutique labels",
        body: "AS Colour and heavyweight blanks printed from one piece with DTF, so you can carry several designs in short runs and reprint the ones that sell.",
      },
      {
        heading: "Cafés and small teams",
        body: "Embroidered aprons, tees and caps for a team of three or thirty, with the logo kept on file for the next order.",
      },
      {
        heading: "Trades",
        body: "Lightweight hi-vis and work polos suited to the climate, in Syzmik, Bisley and JB's Wear.",
      },
    ],
    nearby: ["Maroochydore", "Mooloolaba", "Noosa", "Caloundra", "Nambour"],
  },
  {
    slug: "geelong",
    kind: "city",
    state: "VIC",
    suburb: "Geelong",
    postcode: "3220",
    region: "Victoria",
    travel: "every Geelong order is printed here and shipped to your door",
    title: "Custom Printed Uniforms & Teamwear Geelong",
    description:
      "Custom teamwear, printed uniforms and embroidery shipped to Geelong. From 1 garment, no minimum, group ordering, free design proof.",
    intro:
      "Geelong orders are placed online and printed in our Sydney studio. For clubs, the useful part is the group order: you set up the design once, share a link, and every player or parent enters their own size.",
    serving:
      "Geelong is a sport town with a manufacturing and health workforce behind it, and the Surf Coast on its doorstep. Teamwear and club merchandise sit alongside workwear for industrial sites and uniforms for clinics and offices.",
    useCases: [
      {
        heading: "Football and netball clubs",
        body: "Training tees, hoodies and supporter gear with sponsor logos, names and numbers. Artwork is held between seasons so the next order matches.",
      },
      {
        heading: "Industrial and health uniforms",
        body: "Hi-vis and drill for site crews; scrubs, tunics and embroidered polos in Biz Care for clinics. Different garments, same logo file.",
      },
      {
        heading: "Surf Coast labels",
        body: "Tees and hoodies printed in small runs for brands selling through Torquay and the coast.",
      },
    ],
    nearby: ["Torquay", "Lara", "Belmont", "North Geelong", "Ocean Grove"],
  },
  {
    slug: "townsville",
    kind: "city",
    state: "QLD",
    suburb: "Townsville",
    postcode: "4810",
    region: "North Queensland",
    travel: "every Townsville order is printed here and freighted north",
    title: "Custom Workwear & Embroidery Townsville",
    description:
      "Hot-climate workwear, embroidery and custom t-shirt printing shipped to Townsville. From 1 garment, no minimum, proofs approved online.",
    intro:
      "Townsville orders are printed in our Sydney studio and freighted north, so allow for the distance when you're working to a date. Pricing, proofing and order tracking all happen online.",
    serving:
      "North Queensland garments have to cope with heat first. For a garrison city that also services the mines out west, that mostly means lightweight workwear, breathable polos and team shirts for units and social clubs.",
    useCases: [
      {
        heading: "Mining services and trades",
        body: "Vented hi-vis, cotton drill and embroidered work shirts in Syzmik, Bisley and Hard Yakka, built for heat and repeated hot washes.",
      },
      {
        heading: "Unit and social club shirts",
        body: "Printed tees, polos and singlets with names or nicknames, from one piece. A group order link collects everyone's size.",
      },
      {
        heading: "Business uniforms",
        body: "Breathable embroidered polos for offices, retail and hospitality, topped up one at a time.",
      },
    ],
    nearby: ["Garbutt", "Kirwan", "Aitkenvale", "Thuringowa", "Mount Louisa"],
  },
  {
    slug: "cairns",
    kind: "city",
    state: "QLD",
    suburb: "Cairns",
    postcode: "4870",
    region: "Far North Queensland",
    travel: "every Cairns order is printed here and freighted to the Far North",
    title: "Custom T-Shirts & Staff Uniforms Cairns",
    description:
      "Custom t-shirts, crew shirts and staff uniforms shipped to Cairns. From 1 garment, no minimum, lightweight fabrics, proofs approved online.",
    intro:
      "Cairns is at the far end of our freight network, so order ahead of the date you need the garments. The rest is straightforward: build the order online, approve the proof, and follow it through production from your account.",
    serving:
      "Tourism sets the rhythm in Cairns. Reef and rainforest operators, accommodation and hospitality venues all need crew shirts that stay comfortable in tropical heat and can be re-ordered in small numbers as staff come and go with the season.",
    useCases: [
      {
        heading: "Tour and reef operators",
        body: "Lightweight, quick-drying polos and tees with an embroidered or printed logo. Keep prints small; a large solid panel traps heat.",
      },
      {
        heading: "Hospitality and accommodation",
        body: "Staff polos, aprons and caps from a single garment, so seasonal hires don't force a bulk order.",
      },
      {
        heading: "Trades",
        body: "Vented hi-vis and work shirts in Syzmik, Bisley and JB's Wear for crews working outdoors year-round.",
      },
    ],
    nearby: ["Portsmith", "Edge Hill", "Smithfield", "Gordonvale", "Palm Cove"],
  },
]

export const getLocation = (slug: string): Location | undefined =>
  locations.find((l) => l.slug === slug)
