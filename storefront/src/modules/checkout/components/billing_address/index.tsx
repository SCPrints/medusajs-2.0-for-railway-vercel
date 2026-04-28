import React, { useState, useEffect } from "react"
import Input from "@modules/common/components/input"
import NativeSelect from "@modules/common/components/native-select"
import CountrySelect from "../country-select"
import { HttpTypes } from "@medusajs/types"
import { AUSTRALIAN_STATES_AND_TERRITORIES } from "@modules/checkout/lib/australian-states"

const BillingAddress = ({ cart }: { cart: HttpTypes.StoreCart | null }) => {
  const [formData, setFormData] = useState<any>({})

  useEffect(() => {
    setFormData({
      "billing_address.first_name": cart?.billing_address?.first_name || "",
      "billing_address.last_name": cart?.billing_address?.last_name || "",
      "billing_address.address_1": cart?.billing_address?.address_1 || "",
      "billing_address.address_2": cart?.billing_address?.address_2 || "",
      "billing_address.company": cart?.billing_address?.company || "",
      "billing_address.postal_code": cart?.billing_address?.postal_code || "",
      "billing_address.city": cart?.billing_address?.city || "",
      "billing_address.country_code": cart?.billing_address?.country_code || "",
      "billing_address.province": cart?.billing_address?.province || "",
      "billing_address.phone": cart?.billing_address?.phone || "",
    })
  }, [cart?.billing_address])

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLInputElement | HTMLSelectElement
    >
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    })
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="First name"
          name="billing_address.first_name"
          autoComplete="given-name"
          value={formData["billing_address.first_name"]}
          onChange={handleChange}
          required
          data-testid="billing-first-name-input"
        />
        <Input
          label="Last name"
          name="billing_address.last_name"
          autoComplete="family-name"
          value={formData["billing_address.last_name"]}
          onChange={handleChange}
          required
          data-testid="billing-last-name-input"
        />
        <Input
          label="Address"
          name="billing_address.address_1"
          autoComplete="address-line1"
          value={formData["billing_address.address_1"]}
          onChange={handleChange}
          required
          data-testid="billing-address-input"
        />
        <Input
          label="Apartment, suite, unit (optional)"
          name="billing_address.address_2"
          autoComplete="address-line2"
          value={formData["billing_address.address_2"] ?? ""}
          onChange={handleChange}
          data-testid="billing-address-line2-input"
        />
        <Input
          label="Company"
          name="billing_address.company"
          value={formData["billing_address.company"]}
          onChange={handleChange}
          autoComplete="organization"
          data-testid="billing-company-input"
        />
        <Input
          label="Postal code"
          name="billing_address.postal_code"
          autoComplete="postal-code"
          value={formData["billing_address.postal_code"]}
          onChange={handleChange}
          required
          data-testid="billing-postal-input"
        />
        <Input
          label="City"
          name="billing_address.city"
          autoComplete="address-level2"
          value={formData["billing_address.city"]}
          onChange={handleChange}
          required
          data-testid="billing-city-input"
        />
        <CountrySelect
          name="billing_address.country_code"
          autoComplete="country"
          region={cart?.region}
          value={formData["billing_address.country_code"]}
          onChange={handleChange}
          required
          data-testid="billing-country-select"
        />
        {formData["billing_address.country_code"]?.toLowerCase() === "au" ? (
          <NativeSelect
            name="billing_address.province"
            autoComplete="address-level1"
            value={formData["billing_address.province"] || ""}
            onChange={handleChange}
            required
            data-testid="billing-province-select"
            placeholder="State / Province *"
          >
            {AUSTRALIAN_STATES_AND_TERRITORIES.map((state) => (
              <option key={state.value} value={state.value}>
                {state.label}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <Input
            label="State / Province"
            name="billing_address.province"
            autoComplete="address-level1"
            value={formData["billing_address.province"]}
            onChange={handleChange}
            required
            data-testid="billing-province-input"
          />
        )}
        <Input
          label="Phone"
          name="billing_address.phone"
          autoComplete="tel"
          value={formData["billing_address.phone"]}
          onChange={handleChange}
          data-testid="billing-phone-input"
        />
      </div>
    </>
  )
}

export default BillingAddress
