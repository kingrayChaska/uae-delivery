import { getTranslations } from "next-intl/server";

import Badge from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import PricingRuleForm from "@/components/manager/pricing-rule-form";
import ActivateRuleButton from "@/components/manager/activate-rule-button";
import { requireRoleOrRedirect } from "@/lib/auth/require-role-or-redirect";
import { getActivePricingRules } from "@/lib/pricing/get-active-rule";
import { isFallbackRule, isFlatRate } from "@/lib/pricing/config";
import { listPricingRules } from "@/services/pricing-rules";
import { ACCOUNT_TYPES, DELIVERY_TYPES } from "@/lib/types";
import { getFormat } from "@/i18n/server";

import type { Metadata } from "next";
import type { PricingRule } from "@/lib/types";

export const generateMetadata = async (): Promise<Metadata> => ({
  title: (await getTranslations("manager.pricing"))("meta"),
});

const ManagerPricingPage = async () => {
  await requireRoleOrRedirect("manager");
  const [active, rules, t, tShipments, format] = await Promise.all([
    getActivePricingRules(),
    listPricingRules(),
    getTranslations("manager.pricing"),
    getTranslations("shipments.deliveryType"),
    getFormat(),
  ]);

  const money = (rule: PricingRule, value: number) =>
    format.money(value, rule.currency);
  const describe = (rule: PricingRule) => {
    const max = rule.maxDistanceKm;
    if (isFlatRate(rule)) {
      const price = money(rule, rule.basePrice);
      return max === null
        ? t("flatUnlimited", { price })
        : t("flat", { price, distance: format.km(max, 0) });
    }
    const tiered = {
      price: money(rule, rule.basePrice),
      distance: format.km(rule.baseDistanceKm, 0),
      perKm: money(rule, rule.additionalPricePerKm),
    };
    return max === null
      ? t("tieredUnlimited", tiered)
      : t("tiered", { ...tiered, max: format.km(max, 0) });
  };
  const target = (rule: Pick<PricingRule, "accountType" | "deliveryType">) =>
    t("target", {
      account: t(`accounts.${rule.accountType}`),
      service: tShipments(`${rule.deliveryType}.short`),
    });

  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
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
                      {target({ accountType: account, deliveryType: type })}
                    </span>
                    {isFallbackRule(rule) ? (
                      <Badge variant="warning">{t("notConfigured")}</Badge>
                    ) : (
                      <Badge variant="success">{t("active")}</Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground">{describe(rule)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("weightLine", {
                      weight: format.kg(rule.includedWeightKg),
                      perKg: money(rule, rule.additionalPricePerKg),
                      codFee: money(rule, rule.codFee),
                    })}
                  </p>
                </CardContent>
              </Card>
            );
          }),
        )}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <h2 className="text-lg font-medium">{t("newRule")}</h2>
          <PricingRuleForm current={active} />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">{t("history")}</h2>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-180 text-sm">
            <thead className="bg-secondary/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  {t("columns.name")}
                </th>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  {t("columns.appliesTo")}
                </th>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  {t("columns.pricing")}
                </th>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  {t("columns.weight")}
                </th>
                <th scope="col" className="px-3 py-2 text-start font-medium">
                  {t("columns.created")}
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">{t("columns.status")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{rule.name}</td>
                  <td className="px-3 py-2">{target(rule)}</td>
                  <td className="px-3 py-2 font-brand-mono text-xs">
                    {describe(rule)}
                  </td>
                  <td className="px-3 py-2 font-brand-mono text-xs">
                    {t("weightShort", {
                      weight: format.kg(rule.includedWeightKg),
                      perKg: money(rule, rule.additionalPricePerKg),
                    })}
                  </td>
                  <td className="px-3 py-2 font-brand-mono text-xs whitespace-nowrap text-muted-foreground">
                    {format.date(rule.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-end">
                    {rule.isActive ? (
                      <Badge variant="success">{t("active")}</Badge>
                    ) : (
                      <ActivateRuleButton ruleId={rule.id} />
                    )}
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
