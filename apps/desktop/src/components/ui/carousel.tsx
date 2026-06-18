// @ts-nocheck
import { createSignal, createEffect, createMemo, createContext, useContext, type JSX } from "solid-js"
import useEmblaCarousel, {
  type UseEmblaCarouselType,
} from "embla-carousel-solid"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-solid"

type CarouselApi = UseEmblaCarouselType[1]
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>
type CarouselOptions = UseCarouselParameters[0]
type CarouselPlugin = UseCarouselParameters[1]

type CarouselProps = {
  opts?: CarouselOptions
  plugins?: CarouselPlugin
  orientation?: "horizontal" | "vertical"
  setApi?: (api: CarouselApi) => void
}

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0]
  api: ReturnType<typeof useEmblaCarousel>[1]
  scrollPrev: () => void
  scrollNext: () => void
  canScrollPrev: boolean
  canScrollNext: boolean
} & CarouselProps

const CarouselContext = createContext<CarouselContextProps | null>(null)

function useCarousel() {
  const context = useContext(CarouselContext)

  if (!context) {
    throw new Error("useCarousel must be used within a <Carousel />")
  }

  return context
}

function Carousel(props: JSX.HTMLAttributes<HTMLDivElement> & CarouselProps) {
  const [carouselRef, api] = useEmblaCarousel(
    () => ({
      ...props.opts,
      axis: props.orientation === "horizontal" ? "x" : "y",
    }),
    () => props.plugins
  )
  const [canScrollPrev, setCanScrollPrev] = createSignal(false)
  const [canScrollNext, setCanScrollNext] = createSignal(false)

  const onSelect = (api: CarouselApi) => {
    if (!api) return
    setCanScrollPrev(api.canScrollPrev())
    setCanScrollNext(api.canScrollNext())
  }

  const scrollPrev = () => {
    api()?.scrollPrev()
  }

  const scrollNext = () => {
    api()?.scrollNext()
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault()
      scrollPrev()
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      scrollNext()
    }
  }

  createEffect(() => {
    const currentApi = api()
    if (!currentApi || !props.setApi) return
    props.setApi(currentApi)
  })

  createEffect(() => {
    const currentApi = api()
    if (!currentApi) return
    onSelect(currentApi)
    currentApi.on("reInit", onSelect)
    currentApi.on("select", onSelect)
  })

  const contextValue = createMemo<CarouselContextProps>(() => ({
    carouselRef,
    api: api(),
    opts: props.opts,
    orientation: props.orientation ?? (props.opts?.axis === "y" ? "vertical" : "horizontal"),
    scrollPrev,
    scrollNext,
    canScrollPrev: canScrollPrev(),
    canScrollNext: canScrollNext(),
  }))

  return (
    <CarouselContext.Provider value={contextValue()}>
      <div
        onKeyDownCapture={handleKeyDown}
        class={cn("relative", props.class)}
        role="region"
        aria-roledescription="carousel"
        data-slot="carousel"
        {...props}
      >
        {props.children}
      </div>
    </CarouselContext.Provider>
  )
}

function CarouselContent(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const { carouselRef, orientation } = useCarousel()

  return (
    <div
      ref={carouselRef}
      class="overflow-hidden"
      data-slot="carousel-content"
    >
      <div
        class={cn(
          "flex",
          orientation() === "horizontal" ? "-ml-4" : "-mt-4 flex-col",
          props.class
        )}
        {...props}
      />
    </div>
  )
}

function CarouselItem(props: JSX.HTMLAttributes<HTMLDivElement>) {
  const { orientation } = useCarousel()

  return (
    <div
      role="group"
      aria-roledescription="slide"
      data-slot="carousel-item"
      class={cn(
        "min-w-0 shrink-0 grow-0 basis-full",
        orientation() === "horizontal" ? "pl-4" : "pt-4",
        props.class
      )}
      {...props}
    />
  )
}

function CarouselPrevious(props: { class?: string; variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link"; size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg" }) {
  const { orientation, scrollPrev, canScrollPrev } = useCarousel()

  return (
    <Button
      data-slot="carousel-previous"
      variant={props.variant ?? "outline"}
      size={props.size ?? "icon-sm"}
      class={cn(
        "absolute touch-manipulation rounded-full",
        orientation() === "horizontal"
          ? "top-1/2 -left-12 -translate-y-1/2"
          : "-top-12 left-1/2 -translate-x-1/2 rotate-90",
        props.class
      )}
      disabled={!canScrollPrev()}
      onClick={scrollPrev}
    >
      <ChevronLeftIcon />
      <span class="sr-only">Previous slide</span>
    </Button>
  )
}

function CarouselNext(props: { class?: string; variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "link"; size?: "default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg" }) {
  const { orientation, scrollNext, canScrollNext } = useCarousel()

  return (
    <Button
      data-slot="carousel-next"
      variant={props.variant ?? "outline"}
      size={props.size ?? "icon-sm"}
      class={cn(
        "absolute touch-manipulation rounded-full",
        orientation() === "horizontal"
          ? "top-1/2 -right-12 -translate-y-1/2"
          : "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
        props.class
      )}
      disabled={!canScrollNext()}
      onClick={scrollNext}
    >
      <ChevronRightIcon />
      <span class="sr-only">Next slide</span>
    </Button>
  )
}

export {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  useCarousel,
}
