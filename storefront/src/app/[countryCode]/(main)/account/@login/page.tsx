import { Metadata } from "next"
import LoginTemplate from "@modules/account/templates/login-template"

// No title here: /account renders this slot and @dashboard together, and this
// title won, so signed-in customers saw "Sign in" on their Account page.
export const metadata: Metadata = {
  description: "Sign in to your SC PRINTS account.",
}

export default async function Login(){return <LoginTemplate />
}
