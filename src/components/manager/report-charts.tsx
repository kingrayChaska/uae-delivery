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

import { BRAND } from '@/lib/brand';

type ReportChartsProps = {
  trend: { date: string; shipments: number; delivered: number }[];
  drivers: { name: string; delivered: number; failed: number }[];
};

const ROUTE = BRAND.purple;
const SIGNAL = BRAND.teal;
const FAILED = '#c2410c';

const ReportCharts = ({ trend, drivers }: ReportChartsProps) => {
  const topDrivers = drivers.slice(0, 8);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-md border p-4">
        <p className="mb-3 text-sm font-medium">Daily shipments</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ left: -20, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} fontSize={11} minTickGap={16} />
              <YAxis allowDecimals={false} fontSize={11} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="shipments" name="Booked" stroke={ROUTE} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="delivered" name="Delivered" stroke={SIGNAL} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-md border p-4">
        <p className="mb-3 text-sm font-medium">Top drivers</p>
        {topDrivers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No driver activity in this range.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDrivers} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="name" fontSize={11} interval={0} tickFormatter={(value: string) => value.split(' ')[0]} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip />
                <Legend />
                <Bar dataKey="delivered" name="Delivered" stackId="a" fill={ROUTE} />
                <Bar dataKey="failed" name="Failed" stackId="a" fill={FAILED} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportCharts;
