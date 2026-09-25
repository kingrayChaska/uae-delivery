'use client';

import { useState } from 'react';

import Button from '@/components/ui/button';
import Input from '@/components/ui/input';
import FieldError from '@/components/ui/field-error';
import { addBusinessMemberAction, removeBusinessMemberAction } from '@/lib/business/actions';
import { useServerAction } from '@/lib/hooks/use-server-action';

type BusinessMembersProps = {
  businessId: string;
  members: { id: string; fullName: string; email: string }[];
};

const BusinessMembers = ({ businessId, members }: BusinessMembersProps) => {
  const [email, setEmail] = useState('');
  const { run, isPending, error } = useServerAction();

  return (
    <div className="flex flex-col gap-3">
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">No members yet. Add an existing customer account by email.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <div>
                <p className="font-medium">{member.fullName}</p>
                <p className="text-xs text-muted-foreground">{member.email}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => run(() => removeBusinessMemberAction(businessId, member.id))}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="customer@company.ae"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button
          type="button"
          disabled={isPending || !email}
          onClick={async () => {
            const ok = await run(() => addBusinessMemberAction(businessId, email));
            if (ok) setEmail('');
          }}
        >
          Add member
        </Button>
      </div>
      <FieldError message={error ?? undefined} />
    </div>
  );
};

export default BusinessMembers;
