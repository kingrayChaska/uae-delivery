// pickup_date is a plain calendar date (no time/zone), so it's formatted as
// local midnight rather than parsed as UTC — which could shift it a day.
export const formatPickupDate = (date: string | null) =>
  date
    ? new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'No date set';
