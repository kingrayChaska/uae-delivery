import RouteMapGraphic from '@/components/marketing/route-map-graphic';
import TrackingTimeline from '@/components/shipment/tracking-timeline';
import { getTrackingMilestones } from '@/lib/shipment/tracking-milestones';

// Demonstration only — spec explicitly allows this section to be a visual
// demo rather than a real, live shipment.
const DEMO_MILESTONES = getTrackingMilestones('in_transit');

const LiveTrackingDemo = () => {
  return (
    <section className="bg-brand-route-deep py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 md:grid-cols-2">
        <div className="flex flex-col gap-6">
          <h2 className="font-display text-3xl font-semibold text-brand-paper md:text-4xl">
            Watch it move, door to door
          </h2>
          <p className="max-w-md text-brand-paper/70">
            Every shipment gets a live map from the moment a driver is assigned — no guessing
            where it is or when it&apos;ll arrive.
          </p>
          <TrackingTimeline milestones={DEMO_MILESTONES} dark />
        </div>

        <RouteMapGraphic />
      </div>
    </section>
  );
};

export default LiveTrackingDemo;
