import Badge from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import PricingRuleForm from '@/components/manager/pricing-rule-form';
import ActivateRuleButton from '@/components/manager/activate-rule-button';
import { requireRoleOrRedirect } from '@/lib/auth/require-role-or-redirect';
import { getActivePricingRule } from '@/lib/pricing/get-active-rule';
import { listPricingRules } from '@/services/pricing-rules';

const ManagerPricingPage = async () => {
  await requireRoleOrRedirect('manager');
  const [active, rules] = await Promise.all([getActivePricingRule(), listPricingRules()]);

  return (
    <main className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Pricing</h1>
        <p className="text-sm text-muted-foreground">
          Active: first {active.baseDistanceKm} km {active.currency} {active.basePrice.toFixed(2)}, then{' '}
          {active.currency} {active.additionalPricePerKm.toFixed(2)}/km — applied to every new booking.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <p className="text-sm font-medium">New pricing rule</p>
          <PricingRuleForm current={active} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">Rule history</h2>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Base km</th>
                <th className="px-3 py-2 font-medium">Base price</th>
                <th className="px-3 py-2 font-medium">Per extra km</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{rule.name}</td>
                  <td className="px-3 py-2 font-brand-mono">{rule.baseDistanceKm}</td>
                  <td className="px-3 py-2 font-brand-mono">
                    {rule.currency} {rule.basePrice.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 font-brand-mono">
                    {rule.currency} {rule.additionalPricePerKm.toFixed(2)}
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
