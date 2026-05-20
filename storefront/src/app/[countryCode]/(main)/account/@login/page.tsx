import { Metadata } from "next"
import { connection } from "next/server"

import LoginTemplate from "@modules/account/templates/login-template"

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your SC PRINTS account.",
}

export default async function Login(){
  await connection()
  return <LoginTemplate />
}
