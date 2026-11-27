// Portal e2e helper (throwaway DB only; run.sh copies it in and removes it): asks for a
// password-reset token the way the "forgot password" route does, and prints it.
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { generateResetPasswordTokenWorkflow } from "@medusajs/medusa/core-flows"

export default async function run({ container }: any) {
  const { http } = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE).projectConfig
  const { result } = await generateResetPasswordTokenWorkflow(container).run({
    input: {
      entityId: process.env.RESET_EMAIL as string,
      actorType: "customer",
      provider: "emailpass",
      secret: http.jwtSecret,
      jwtOptions: http.jwtOptions,
    },
  })
  console.log(`E2E_TOKEN=${result}`)
}
