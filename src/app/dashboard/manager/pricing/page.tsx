import Badge from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import PricingRuleForm from '@/components/manager/pricing-rule-form';
import ActivateRuleButton from '@/components/manager/activate-rule-button';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getActivePricingRules } from '@/lib/pricing/get-active-rule';
import { DELIVERY_TYPE_COPY, isFallbackRule, isFlatRate } from '@/lib/pricing/config';
import { listPricingRules } from '@/services/pricing-rules';
import { ACCOUNT_TYPES, DELIVERY_TYPES } from '@/lib/types';

import type { PricingRule } from '@/lib/types';

const ACCOUNT_LABELS = { individual: 'Individual', merchant: 'Merchant' } as const;

const describe = (rule: PricingRule) =>
  isFlatRate(rule)
    ? `Flat ${rule.currency} ${rule.basePrice.toFixed(2)} up to ${rule.maxDistanceKm} km`
    : `${rule.currency} ${rule.basePrice.toFixed(2)} for ${rule.baseDistanceKm} km, then ${rule.currency} ${rule.additionalPricePerKm.toFixed(2)}/km (max ${rule.maxDistanceKm} km)`;

const ManagerPricingPage = async () => {
  await requireRoleOrRedirect('manager');
  const [active, rules] = await Promise.all([getActivePricingRules(), listPricingRules()]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">Pricing</h1>
        <p className="text-sm text-muted-foreground">
          One active rule per account type and service. Every booking is priced — and re-checked by the database — with it.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ACCOUNT_TYPES.flatMap((account) =>
          DELIVERY_TYPES.map((type) => {
            const rule = active[account][type];
            return (
              <Card key={`${account}-${type}`}>
                <CardContent className="flex flex-col gap-1.5 pt-5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {ACCOUNT_LABELS[account]} · {DELIVERY_TYPE_COPY[type].label.replace(' Delivery', '')}
                    </span>
                    {isFallbackRule(rule) ? <Badge variant="warning">Not configured</Badge> : <Badge variant="success">Active</Badge>}
                  </div>
                  <p className="text-muted-foreground">{describe(rule)}</p>
                  <p className="text-xs text-muted-foreground">
                    {rule.includedWeightKg} kg included, then {rule.currency} {rule.additionalPricePerKg.toFixed(2)}/kg · COD fee{' '}
                    {rule.currency} {rule.codFee.toFixed(2)}
                  </p>
                </CardContent>
              </Card>
            );
          }),
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <h2 className="text-lg font-medium">New pricing rule</h2>
          <PricingRuleForm current={active} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Rule history</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Name</th>
                <th scope="col" className="px-3 py-2 font-medium">Applies to</th>
                <th scope="col" className="px-3 py-2 font-medium">Pricing</th>
                <th scope="col" className="px-3 py-2 font-medium">Weight</th>
                <th scope="col" className="px-3 py-2 font-medium">Created</th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Status</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{rule.name}</td>
                  <td className="px-3 py-2">
                    {ACCOUNT_LABELS[rule.accountType]} · {DELIVERY_TYPE_COPY[rule.deliveryType].label.replace(' Delivery', '')}
                  </td>
                  <td className="px-3 py-2 font-brand-mono text-xs">{describe(rule)}</td>
                  <td className="px-3 py-2 font-brand-mono text-xs">
                    {rule.includedWeightKg} kg + {rule.currency} {rule.additionalPricePerKg.toFixed(2)}/kg
                  </td>
                  <td className="px-3 py-2 font-brand-mono text-xs text-muted-foreground">
                    {new Date(rule.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {rule.isActive ? <Badge variant="success">Active</Badge> : <ActivateRuleButton ruleId={rule.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
};

export default ManagerPricingPage;
