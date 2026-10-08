import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type OutcomeProof = {
  outcome: 'cancelled' | 'returned';
  // Signed for an hour; null if the file can't be read.
  photoUrl: string | null;
  // The reason as the driver gave it.
  reason: string;
  recordedAt: string;
};

// The driver's photo and reason for cancelling or returning a shipment
// (shipment_outcome_proofs, migration 0037). RLS lets the shipment's
// driver, its customer and staff read the row, and the proof-of-delivery
// bucket's policy (0013) gives the same people the photo. Anyone else, or
// a shipment the driver didn't end, gets null.
export const getOutcomeProof = async (shipmentId: string): Promise<OutcomeProof | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('shipment_outcome_proofs')
    .select('outcome, photo_path, reason, created_at')
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;

  const { data: signed } = await supabase.storage.from('proof-of-delivery').createSignedUrl(data.photo_path, 3600);
  return {
    outcome: data.outcome,
    photoUrl: signed?.signedUrl ?? null,
    reason: data.reason,
    recordedAt: data.created_at,
  };
};
