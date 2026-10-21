import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const strokeProps = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export function StarIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45L2.6 9.45l6.5-.95L12 2.6z" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </svg>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} {...props}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </svg>
  );
}

export function ChevronUpIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} {...props}>
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function ArrowsUpDownIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} {...props}>
      <path d="M9 20V4M9 4L5.5 7.5M9 4l3.5 3.5" />
      <path d="M15 4v16M15 20l3.5-3.5M15 20l-3.5-3.5" />
    </svg>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} {...props}>
      <path d="M9 4l1.6 3.9L14.5 9.5 10.6 11 9 15l-1.6-4L3.5 9.5l3.9-1.6L9 4z" />
      <path d="M17 13l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" />
    </svg>
  );
}

export function TapIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} {...props}>
      <path d="M9 11.5V6a1.5 1.5 0 013 0v4" />
      <path d="M12 10V5a1.5 1.5 0 013 0v5.5" />
      <path d="M15 10.5V7a1.5 1.5 0 013 0v7a6 6 0 01-6 6h-.8a5 5 0 01-3.6-1.5L5 15.2a1.7 1.7 0 012.5-2.3L9 14.4" />
    </svg>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="8" cy="18" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SwipeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} {...props}>
      <path d="M12 3v18" />
      <path d="M12 3L8.5 6.5M12 3l3.5 3.5" />
      <path d="M12 21l-3.5-3.5M12 21l3.5-3.5" />
    </svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...strokeProps} {...props}>
      <path d="M4 4l16 16" />
      <path d="M9.9 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.3" />
      <path d="M6.4 7.9A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 3.4-.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
