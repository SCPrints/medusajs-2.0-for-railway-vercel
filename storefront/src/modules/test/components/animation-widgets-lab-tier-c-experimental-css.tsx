"use client"

/** Scroll-linked bar via CSS scroll-driven animations where supported. */
export function LabTierCScrollDrivenBar() {
  return (
    <div className="space-y-3">
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @supports (animation-timeline: scroll()) {
            .lab-tier-c-scroll-host {
              height: 120px;
              overflow-y: auto;
              border: 1px solid var(--border-base, #e5e5e5);
              border-radius: 0.75rem;
              padding: 0.75rem;
            }
            .lab-tier-c-scroll-progress {
              position: sticky;
              top: 0;
              height: 4px;
              background: #FF2E63;
              transform-origin: left;
              animation: lab-scrollx linear forwards;
              animation-timeline: scroll(nearest);
            }
            @keyframes lab-scrollx {
              from { transform: scaleX(0); }
              to { transform: scaleX(1); }
            }
          }
        `,
        }}
      />
      <div className="lab-tier-c-scroll-host max-w-md">
        <div className="lab-tier-c-scroll-progress mb-2 rounded-full" />
        {Array.from({ length: 16 }, (_, i) => (
          <p key={i} className="mb-2 text-xs text-ui-fg-muted">
            Scroll line {i + 1} — progress bar ties to this scroller in supporting browsers.
          </p>
        ))}
      </div>
      <p className="text-xs text-ui-fg-muted">
        Uses <code className="text-ui-fg-base">animation-timeline: scroll()</code> inside the box; falls back to a
        static bar where unsupported.
      </p>
    </div>
  )
}

/** Pure CSS :has() grid dimming */
export function LabTierCHasSiblingDim() {
  return (
    <div className="space-y-3">
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .lab-tier-c-has-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 0.5rem;
          }
          .lab-tier-c-has-grid:has(.lab-tier-c-card:hover) .lab-tier-c-card:not(:hover) {
            opacity: 0.42;
            filter: grayscale(0.3);
          }
          .lab-tier-c-card {
            transition: opacity 0.2s ease, filter 0.2s ease, transform 0.2s ease;
          }
          .lab-tier-c-card:hover {
            transform: translateY(-2px);
          }
        `,
        }}
      />
      <div className="lab-tier-c-has-grid max-w-md">
        {["A", "B", "C", "D", "E", "F"].map((x) => (
          <div
            key={x}
            className="lab-tier-c-card flex h-16 cursor-pointer items-center justify-center rounded-lg border border-ui-border-base bg-ui-bg-subtle text-sm font-medium"
          >
            {x}
          </div>
        ))}
      </div>
      <p className="text-xs text-ui-fg-muted">Hover one card — peers dim via :has() (modern browsers).</p>
    </div>
  )
}

/** Mask-position driven wipe */
export function LabTierCMaskImageWipe({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <div className="space-y-3">
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .lab-tier-c-mask-box {
            height: 140px;
            border-radius: 0.75rem;
            background: linear-gradient(135deg, #FF2E63, #6366f1);
            -webkit-mask-image: radial-gradient(circle at 30% 40%, black 0%, black 35%, transparent 36%);
            mask-image: radial-gradient(circle at 30% 40%, black 0%, black 35%, transparent 36%);
            -webkit-mask-size: 250% 250%;
            mask-size: 250% 250%;
            animation: lab-mask-pan 4s ease-in-out infinite alternate;
          }
          @keyframes lab-mask-pan {
            from { -webkit-mask-position: 0% 0%; mask-position: 0% 0%; }
            to { -webkit-mask-position: 100% 100%; mask-position: 100% 100%; }
          }
          @media (prefers-reduced-motion: reduce) {
            .lab-tier-c-mask-box { animation: none; }
          }
        `,
        }}
      />
      <div className={`lab-tier-c-mask-box max-w-md ${reducedMotion ? "!animate-none" : ""}`} />
      <p className="text-xs text-ui-fg-muted">Gradient revealed by animated radial mask-position.</p>
    </div>
  )
}
