import 'server-only';

import { createClient } from '@/lib/supabase/server';

import type { Coordinates } from '@/lib/types';

export type ProofOfDelivery = {
  recipientName: string | null;
  photoUrl: string | null;
  signatureUrl: string | null;
  otpVerified: boolean;
  qrVerified: boolean;
  notes: string | null;
  deliveredAt: string;
  // The delivery address the driver completed the job at.
  location: { address: string; coordinates: Coordinates } | null;
};

// Evidence recorded by complete_delivery() (migration 0015). RLS decides
// who can see it: proof_of_delivery_select lets the shipment's customer,
// its driver and staff read the row, and the proof-of-delivery bucket's
// policy (0013) gives the same people the photo and signature files. A
// caller who can't see the shipment gets null, exactly as if there were
// no proof yet.
export const getProofOfDelivery = async (shipmentId: string): Promise<ProofOfDelivery | null> => {
  const supabase = await createClient();

  const [{ data: pod }, { data: shipment }] = await Promise.all([
    supabase
      .from('proof_of_delivery')
      .select('recipient_name, photo_url, signature_url, recipient_otp_verified, qr_verified, notes, created_at')
      .eq('shipment_id', shipmentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('shipments').select('dropoff_address, dropoff_lat, dropoff_lng').eq('id', shipmentId).maybeSingle(),
  ]);

  if (!pod) return null;

  const paths = [pod.photo_url, pod.signature_url].filter((path): path is string => Boolean(path));
  const signedByPath = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from('proof-of-delivery').createSignedUrls(paths, 3600);
    for (const entry of signed ?? []) {
      if (entry.path && entry.signedUrl) signedByPath.set(entry.path, entry.signedUrl);
    }
  }

  return {
    recipientName: pod.recipient_name,
    photoUrl: pod.photo_url ? (signedByPath.get(pod.photo_url) ?? null) : null,
    signatureUrl: pod.signature_url ? (signedByPath.get(pod.signature_url) ?? null) : null,
    otpVerified: pod.recipient_otp_verified,
    qrVerified: pod.qr_verified,
    notes: pod.notes,
    deliveredAt: pod.created_at,
    location: shipment
      ? { address: shipment.dropoff_address, coordinates: { lat: shipment.dropoff_lat, lng: shipment.dropoff_lng } }
      : null,
  };
};
