"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";

export type ImageBox = { left: number; top: number; width: number; height: number };

/**
 * Measures where `object-contain` actually paints the photo inside its
 * container. Reaction coordinates are relative to this box, so a point on the
 * photo lands on the same spot regardless of the viewport aspect ratio.
 *
 * Uses layout metrics (clientWidth/clientHeight), not getBoundingClientRect:
 * inactive cards are scaled and translated by CSS, and a rect measured before
 * a card becomes active would be both stale and distorted.
 */
export function useImageBox(
  ref: RefObject<HTMLElement | null>,
  imageWidth: number,
  imageHeight: number,
): ImageBox {
  const [box, setBox] = useState<ImageBox>({ left: 0, top: 0, width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element || imageWidth <= 0 || imageHeight <= 0) return;

    const measure = () => {
      const frameWidth = element.clientWidth;
      const frameHeight = element.clientHeight;
      if (frameWidth === 0 || frameHeight === 0) return;

      const scale = Math.min(frameWidth / imageWidth, frameHeight / imageHeight);
      const width = imageWidth * scale;
      const height = imageHeight * scale;

      setBox({
        left: (frameWidth - width) / 2,
        top: (frameHeight - height) / 2,
        width,
        height,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, imageWidth, imageHeight]);

  return box;
}
