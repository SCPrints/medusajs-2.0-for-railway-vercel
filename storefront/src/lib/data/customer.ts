"use server"

import { sdk } from "@lib/config"
import medusaError from "@lib/util/medusa-error"
import { HttpTypes } from "@medusajs/types"
import { revalidateTag, updateTag } from "next/cache"
import { redirect } from "next/navigation"
import { cache } from "react"
import { transferGuestCartToCustomer } from "./cart"
import { removeAuthToken, setAuthToken } from "./cookies"
import { authedNextHeaders, awaitedAuthHeaders } from "./sdk-helpers"

// Email/password login returns a JWT string, or (two-step login on) an MFA
// challenge to finish with a code. Redirect / verification responses don't apply.
type LoginResult = Awaited<ReturnType<typeof sdk.auth.login>>
const loginTokenOrThrow = (res: LoginResult) => {
  if (typeof res === "string") return res
  throw new Error("This account needs an extra sign-in step the store doesn't support yet.")
}

export const getCustomer = cache(async function () {
  const headers = await authedNextHeaders({ tags: ["customer"] })
  return await sdk.store.customer
    .retrieve({}, headers)
    .then(({ customer }) => customer)
    .catch(() => null)
})

export const updateCustomer = cache(async function (
  body: HttpTypes.StoreUpdateCustomer
) {
  const headers = await awaitedAuthHeaders()
  const updateRes = await sdk.store.customer
    .update(body, {}, headers)
    .then(({ customer }) => customer)
    .catch(medusaError)

  updateTag("customer")
  return updateRes
})

export async function signup(_currentState: unknown, formData: FormData) {
  const password = formData.get("password") as string
  const customerForm = {
    email: formData.get("email") as string,
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    phone: formData.get("phone") as string,
  }

  try {
    const token = await sdk.auth.register("customer", "emailpass", {
      email: customerForm.email,
      password: password,
    })

    const customHeaders = { authorization: `Bearer ${token}` }
    
    const { customer: createdCustomer } = await sdk.store.customer.create(
      customerForm,
      {},
      customHeaders
    )

    const loginToken = await sdk.auth.login("customer", "emailpass", {
      email: customerForm.email,
      password,
    })

    const finalToken = loginTokenOrThrow(loginToken)
    await setAuthToken(finalToken)

    // If the customer was building a cart as a guest, claim it now that they
    // have an account. Without this, their first order after signup would
    // ship with `customer_id = null` and never reach /account/orders.
    await transferGuestCartToCustomer({ authorization: `Bearer ${finalToken}` })

    updateTag("customer")
    return createdCustomer
  } catch (error: any) {
    return error.toString()
  }
}

export async function login(_currentState: unknown, formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  try {
    const token = await sdk.auth.login("customer", "emailpass", { email, password })
    if (typeof token === "object" && token && "mfa_required" in token) {
      // Two-step login is on: hand the client the challenge; the password alone gives no access.
      return { mfa: { challengeId: token.mfa_challenge.id, token: token.token } }
    }
    const finalToken = loginTokenOrThrow(token)
    await setAuthToken(finalToken)
    updateTag("customer")
    // Claim any guest cart the customer was building before login. Idempotent
    // when no guest cart exists; silently logged when transfer fails.
    await transferGuestCartToCustomer({ authorization: `Bearer ${finalToken}` })
  } catch (error: any) {
    return error.toString()
  }
}

/**
 * "Forgot your password?": asks the backend to email a reset link. The answer
 * is the same whether or not the email has an account, so it can't be used to
 * find out who is a customer.
 */
export async function requestPasswordReset(_currentState: unknown, formData: FormData) {
  const identifier = String(formData.get("email") ?? "").trim()
  if (!identifier) return { error: "Enter your email address." }
  await sdk.auth.resetPassword("customer", "emailpass", { identifier }).catch(() => undefined)
  return { sent: true }
}

/** Sets the new password from an emailed link (one use, 15 minutes). */
export async function resetPassword(_currentState: unknown, formData: FormData) {
  const password = String(formData.get("password") ?? "")
  if (password.length < 8) return { error: "Use at least 8 characters." }
  if (password !== String(formData.get("confirm_password") ?? "")) return { error: "The two passwords don't match." }
  try {
    await sdk.auth.updateProvider(
      "customer",
      "emailpass",
      { email: String(formData.get("email") ?? ""), password },
      String(formData.get("token") ?? "")
    )
    return { done: true }
  } catch {
    return { error: "This link has expired or has already been used. Ask for a new one." }
  }
}

/** Profile → Password: the current password is checked by the backend first. */
export async function changePassword(_currentState: unknown, formData: FormData) {
  const new_password = String(formData.get("new_password") ?? "")
  if (new_password.length < 8) return { success: false, error: "Use at least 8 characters for the new password." }
  if (new_password !== String(formData.get("confirm_password") ?? "")) {
    return { success: false, error: "The two new passwords don't match." }
  }
  try {
    await sdk.client.fetch("/store/customers/me/password", {
      method: "POST",
      headers: await awaitedAuthHeaders(),
      body: { old_password: String(formData.get("old_password") ?? ""), new_password },
    })
    return { success: true, error: null }
  } catch (err: any) {
    return { success: false, error: err?.message || "We couldn't change your password. Try again." }
  }
}

export async function signout(countryCode: string) {
  await sdk.auth.logout()
  removeAuthToken()
  revalidateTag("auth", "max")
  updateTag("customer")
  redirect(`/${countryCode}/account`)
}

export const addCustomerAddress = async (
  _currentState: unknown,
  formData: FormData
): Promise<any> => {
  const address = {
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    company: formData.get("company") as string,
    address_1: formData.get("address_1") as string,
    address_2: formData.get("address_2") as string,
    city: formData.get("city") as string,
    postal_code: formData.get("postal_code") as string,
    province: formData.get("province") as string,
    country_code: formData.get("country_code") as string,
    phone: formData.get("phone") as string,
  }

  const headers = await awaitedAuthHeaders()
  return sdk.store.customer
    .createAddress(address, {}, headers)
    .then(({ customer }) => {
      updateTag("customer")
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}

export const deleteCustomerAddress = async (
  addressId: string
): Promise<void> => {
  const headers = await awaitedAuthHeaders()
  await sdk.store.customer
    .deleteAddress(addressId, headers)
    .then(() => {
      updateTag("customer")
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}

export const updateCustomerAddress = async (
  currentState: Record<string, unknown>,
  formData: FormData
): Promise<any> => {
  const addressId = currentState.addressId as string

  const address = {
    first_name: formData.get("first_name") as string,
    last_name: formData.get("last_name") as string,
    company: formData.get("company") as string,
    address_1: formData.get("address_1") as string,
    address_2: formData.get("address_2") as string,
    city: formData.get("city") as string,
    postal_code: formData.get("postal_code") as string,
    province: formData.get("province") as string,
    country_code: formData.get("country_code") as string,
    phone: formData.get("phone") as string,
  }

  const headers = await awaitedAuthHeaders()
  return sdk.store.customer
    .updateAddress(addressId, address, {}, headers)
    .then(() => {
      updateTag("customer")
      return { success: true, error: null }
    })
    .catch((err) => {
      return { success: false, error: err.toString() }
    })
}
