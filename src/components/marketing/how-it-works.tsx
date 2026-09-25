const STEPS = [
  { title: 'Enter locations', description: 'Pickup and delivery addresses, with map autocomplete.' },
  { title: 'Get a quote', description: 'An instant, distance-based price — no back and forth.' },
  { title: 'Confirm and pay', description: 'Card or cash on delivery, whichever suits the trip.' },
  { title: 'Driver picks up', description: 'A dispatched driver collects the package at the door.' },
  { title: 'Track it live', description: 'Follow the route from pickup to your doorstep.' },
  { title: 'Get proof', description: 'Photo, signature or OTP confirms it arrived.' },
];

const HowItWorks = () => {
  return (
    <section id="how-it-works" className="bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="font-display text-3xl font-semibold text-brand-ink md:text-4xl">
          How it works
        </h2>

        <ol className="relative mt-12 grid gap-8 md:grid-cols-6 md:gap-4">
          <div
            aria-hidden
            className="absolute top-4 hidden h-px w-full bg-[repeating-linear-gradient(90deg,var(--brand-route)_0_8px,transparent_8px_16px)] md:block"
          />
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative flex flex-col gap-2">
              <div className="relative z-10 flex size-8 items-center justify-center rounded-full bg-brand-route font-brand-mono text-sm text-brand-paper">
                {index + 1}
              </div>
              <h3 className="font-display text-base font-medium text-brand-ink">{step.title}</h3>
              <p className="text-sm text-brand-ink/65">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

export default HowItWorks;
