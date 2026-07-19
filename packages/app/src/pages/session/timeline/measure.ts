/** Measure on the next animation frame, only if still mounted. Coalesces RO/layout thrash. */
export function scheduleConnectedMeasure<T extends HTMLElement>(element: T, measure: (element: T) => void) {
  return requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (element.isConnected) measure(element)
    })
  })
}
