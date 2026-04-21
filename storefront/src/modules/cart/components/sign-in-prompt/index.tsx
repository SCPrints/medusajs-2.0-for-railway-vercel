import { Button, Heading, Text } from "@medusajs/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const SignInPrompt = () => {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle/30 p-4 small:flex-row small:items-center small:justify-between">
      <div className="space-y-1">
        <Heading level="h2" className="text-xl leading-7">
          Already have an account?
        </Heading>
        <Text className="text-sm text-ui-fg-subtle">
          Sign in for a better experience.
        </Text>
      </div>
      <div className="shrink-0">
        <LocalizedClientLink href="/account">
          <Button variant="secondary" className="h-10" data-testid="sign-in-button">
            Sign in
          </Button>
        </LocalizedClientLink>
      </div>
    </div>
  )
}

export default SignInPrompt
