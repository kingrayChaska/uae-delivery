import { describe, expect, it } from "vitest";

import { bookingShipmentSchema } from "@/lib/shipment/schemas";

const validShipment = {
  pickup: {
    address: "Dubai Marina",
    lat: 25.08,
    lng: 55.14,
    contactName: "Sender Name",
    contactPhone: "+971501234567",
  },
  dropoff: {
    address: "Downtown Dubai",
    lat: 25.19,
    lng: 55.27,
    contactName: "Recipient Name",
    contactPhone: "+971501234568",
  },
  deliveryType: "same_day",
  packageType: "parcel",
  packageDescription: "Documents",
  packageQuantity: 1,
  isFragile: false,
  recipientPaymentType: "prepaid",
} as const;

describe("booking shipment schema", () => {
  it("requires a positive package weight", () => {
    expect(bookingShipmentSchema.safeParse(validShipment).success).toBe(false);
    expect(
      bookingShipmentSchema.safeParse({
        ...validShipment,
        packageWeightKg: 1.2,
      }).success,
    ).toBe(true);
  });
});
