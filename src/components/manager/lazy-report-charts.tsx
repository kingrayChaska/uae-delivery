'use client';

import dynamic from 'next/dynamic';

// recharts is heavy and only renders in the browser anyway, so it's loaded
// on demand rather than blocking the reports page's first paint.
const LazyReportCharts = dynamic(() => import('@/components/manager/report-charts'), {
  ssr: false,
  loading: () => (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="h-[19rem] animate-pulse rounded-md border bg-muted" />
      <div className="h-[19rem] animate-pulse rounded-md border bg-muted" />
    </div>
  ),
});

export default LazyReportCharts;
