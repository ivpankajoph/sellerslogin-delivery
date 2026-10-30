const readText = (value: unknown) => String(value ?? '').trim()

export const resolveVendorProfile = (profileState: unknown) => {
  const profile = (profileState as any)?.profile || null
  return profile?.vendor || profile?.data || profile || null
}

export const resolveVendorProfilePincode = (
  user: unknown,
  vendorProfile: unknown,
  fallback = ''
) =>
  readText(
    (vendorProfile as any)?.pincode ||
      (vendorProfile as any)?.pin ||
      (vendorProfile as any)?.postal_code ||
      (vendorProfile as any)?.zip ||
      (user as any)?.pincode ||
      (user as any)?.pin ||
      (user as any)?.postal_code ||
      (user as any)?.zip ||
      fallback
  )
