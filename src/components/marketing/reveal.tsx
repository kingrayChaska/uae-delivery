import type { CSSProperties, ElementType, ReactNode } from 'react';

type RevealProps = {
  as?: ElementType;
  // Staggers items in a row: later items finish their fade slightly later.
  delay?: number;
  className?: string;
  children: ReactNode;
};

// Fades content in as it scrolls into view, using a CSS scroll-driven
// animation (globals.css, [data-reveal]). No JavaScript: how visible an
// element is depends only on where it is in the viewport, so content can
// never get stuck hidden. Browsers without scroll-driven animations, and
// anyone who prefers reduced motion, simply see the static page.
const Reveal = ({ as: Tag = 'div', delay = 0, className, children }: RevealProps) => (
  <Tag
    data-reveal=""
    className={className}
    style={delay ? ({ '--reveal-shift': `${Math.round(delay / 15)}%` } as CSSProperties) : undefined}
  >
    {children}
  </Tag>
);

export default Reveal;
