"use client";

import { useEffect, useState } from "react";
import type { RefObject } from "react";

export type ImageBox = { left: number; top: number; width: number; height: number };

/**
 * Measures where `object-contain` actually paints the photo inside its
 * container. Reaction coordinates are relative to this box, so a point on the
 * photo lands on the same spot regardless of the viewport aspect ratio.
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
      const rect = element.getBoundingClientRect();
      const scale = Math.min(rect.width / imageWidth, rect.height / imageHeight);
      const width = imageWidth * scale;
      const height = imageHeight * scale;

      setBox({
        left: (rect.width - width) / 2,
        top: (rect.height - height) / 2,
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
