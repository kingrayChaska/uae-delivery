import { describe, expect, it } from "vitest";

import { bookingSchema, bookingShipmentSchema } from "@/lib/shipment/schemas";

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

  it("rejects pickup and delivery locations within 100 metres", () => {
    const sameLocation = {
      ...validShipment,
      pickup: { ...validShipment.pickup, lat: 25.0772, lng: 55.1409 },
      dropoff: { ...validShipment.dropoff, lat: 25.0773, lng: 55.141 },
      packageWeightKg: 1.2,
    };
    const result = bookingShipmentSchema.safeParse(sameLocation);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["dropoff", "lat"],
          message: "booking.errors.sameLocation",
        }),
      );
    }
    expect(
      bookingSchema.safeParse({ ...sameLocation, paymentMethod: "card" })
        .success,
    ).toBe(false);
  });

  it("accepts different pickup and delivery locations", () => {
    expect(
      bookingShipmentSchema.safeParse({
        ...validShipment,
        packageWeightKg: 1.2,
      }).success,
    ).toBe(true);
  });
});
