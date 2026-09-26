import type { StudioStatus } from "./types";
export async function revenueCat(status: StudioStatus) {
  if (!status.billingConfigured) throw new Error("Connect your RevenueCat Web Billing keys in Advanced to load real plans.");
  const { Purchases } = await import("@revenuecat/purchases-js");
  const purchases = Purchases.isConfigured() ? Purchases.getSharedInstance() : Purchases.configure({ apiKey: status.billingPublicKey, appUserId: status.customerId });
  if (purchases.getAppUserId() !== status.customerId) await purchases.changeUser(status.customerId);
  return purchases;
}
