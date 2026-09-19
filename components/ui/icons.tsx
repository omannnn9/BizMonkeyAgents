/**
 * A small, consistent stroke-icon set for the navigation rail — hand-rolled
 * rather than pulling in an icon library for a dozen glyphs. Same visual
 * language everywhere: 1.4px stroke, rounded caps/joins, 20x20 viewBox, no
 * fill. Deliberately plain geometry (a crosshair, a hexagon, a bubble) over
 * anything decorative — the rail's job is instant recognition, not flair.
 */
import type { SVGProps } from "react";

function base(props: SVGProps<SVGSVGElement>) {
  return { width: 18, height: 18, viewBox: "0 0 20 20", fill: "none", "aria-hidden": true, ...props } as const;
}

export function CommandIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 5v3M10 12v3M5 10h3M12 10h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function ColonyIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path
        d="M10 2.5 17 6.5v7L10 17.5 3 13.5v-7L10 2.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M10 2.5v6.2M10 17.5v-6.2M3 6.5l7 4.2 7-4.2" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export function ChatIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path
        d="M3.5 5.5c0-1.1.9-2 2-2h9c1.1 0 2 .9 2 2v6c0 1.1-.9 2-2 2H8l-3.5 3v-3H5.5c-1.1 0-2-.9-2-2v-6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DocumentsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M6 2.5h6l3 3v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 2.5V6h3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7.5 10h5M7.5 13h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function MemoriesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path
        d="M10 2.8a4.7 4.7 0 0 0-2.7 8.5c.4.3.6.8.6 1.3v.4h4.2v-.4c0-.5.2-1 .6-1.3A4.7 4.7 0 0 0 10 2.8Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8.2 15.5h3.6M8.7 17.3h2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function ApprovalsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path
        d="M10 2.3 16 4.5v5c0 4.2-2.6 7.2-6 8.2-3.4-1-6-4-6-8.2v-5L10 2.3Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M7.3 10 9.3 12l3.4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
