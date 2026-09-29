'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTranslations } from 'next-intl';

import { BRAND } from '@/lib/brand';
import { useAppLocale, useFormat } from '@/i18n/hooks';

type ReportChartsProps = {
  trend: { date: string; shipments: number; delivered: number }[];
  drivers: { name: string; delivered: number; failed: number }[];
};

const ROUTE = BRAND.purple;
const SIGNAL = BRAND.teal;
const FAILED = '#c2410c';

// In Arabic the time axis runs right to left and the value axis sits on
// the right, the way Arabic readers scan a chart.
const ReportCharts = ({ trend, drivers }: ReportChartsProps) => {
  const t = useTranslations('manager.reports');
  const format = useFormat();
  const rtl = useAppLocale() === 'ar';
  const margin = rtl ? { right: -20, left: 8 } : { left: -20, right: 8 };
  const topDrivers = drivers.slice(0, 8);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-md border p-4">
        <p className="mb-3 text-sm font-medium">{t('charts.daily')}</p>
        <div className="h-64" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={margin}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis
                dataKey="date"
                reversed={rtl}
                tickFormatter={(value: string) => format.calendarDate(value).replace(/,? \d{4}$/, '')}
                fontSize={11}
                minTickGap={16}
              />
              <YAxis allowDecimals={false} fontSize={11} orientation={rtl ? 'right' : 'left'} tickFormatter={(value: number) => format.number(value)} />
              <Tooltip labelFormatter={(value) => format.calendarDate(String(value))} />
              <Legend />
              <Line type="monotone" dataKey="shipments" name={t('charts.booked')} stroke={ROUTE} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="delivered" name={t('charts.delivered')} stroke={SIGNAL} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-md border p-4">
        <p className="mb-3 text-sm font-medium">{t('charts.topDrivers')}</p>
        {topDrivers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noDrivers')}</p>
        ) : (
          <div className="h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDrivers} margin={margin}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="name" fontSize={11} interval={0} reversed={rtl} tickFormatter={(value: string) => value.split(' ')[0]} />
                <YAxis allowDecimals={false} fontSize={11} orientation={rtl ? 'right' : 'left'} tickFormatter={(value: number) => format.number(value)} />
                <Tooltip />
                <Legend />
                <Bar dataKey="delivered" name={t('charts.delivered')} stackId="a" fill={ROUTE} />
                <Bar dataKey="failed" name={t('charts.failed')} stackId="a" fill={FAILED} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportCharts;
