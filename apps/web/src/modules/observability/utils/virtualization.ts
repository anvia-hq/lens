import type { Rect, Virtualizer } from "@tanstack/react-virtual";

export function observeVirtualElementRect<TScrollElement extends HTMLElement>(
  instance: Virtualizer<TScrollElement, Element>,
  callback: (rect: Rect) => void,
): (() => void) | undefined {
  const element = instance.scrollElement;
  if (!element) return undefined;
  const measure = () => {
    const bounds = element.getBoundingClientRect();
    callback({
      width: bounds.width || element.clientWidth || 600,
      height: bounds.height || element.clientHeight || 600,
    });
  };
  measure();
  if (typeof ResizeObserver === "undefined") {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }
  const observer = new ResizeObserver(measure);
  observer.observe(element);
  return () => observer.disconnect();
}
