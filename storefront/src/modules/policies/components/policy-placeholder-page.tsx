type PolicySection = {
  heading: string
  body: string[]
}

type PolicyPlaceholderPageProps = {
  title: string
  intro: string
  sections: PolicySection[]
}

export default function PolicyPlaceholderPage({
  title,
  intro,
  sections,
}: PolicyPlaceholderPageProps) {
  return (
    <div className="content-container py-14 small:py-20">
      <article className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ui-fg-muted">
          Placeholder — replace with final legal copy before launch
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ui-fg-base">{title}</h1>
        <p className="mt-6 text-base leading-relaxed text-ui-fg-subtle">{intro}</p>
        <div className="mt-10 space-y-10 border-t border-ui-border-base pt-10">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-semibold text-ui-fg-base">{section.heading}</h2>
              <div className="mt-3 space-y-3 text-sm leading-relaxed text-ui-fg-subtle">
                {section.body.map((paragraph, index) => (
                  <p key={`${section.heading}-${index}`}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </article>
    </div>
  )
}
