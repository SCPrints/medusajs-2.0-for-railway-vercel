"use client"

import React from "react"

type Props = {
  children: React.ReactNode
}

type State = {
  hasError: boolean
}

class PdpCustomizerBoundary extends React.Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error("PDP customizer crashed:", error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="mt-8 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
          <p className="text-sm font-medium">Customizer is temporarily unavailable for this product.</p>
          <p className="mt-1 text-xs">
            The product page still works. Please refresh and try again, or continue with the standard product options.
          </p>
        </section>
      )
    }

    return this.props.children
  }
}

export default PdpCustomizerBoundary
