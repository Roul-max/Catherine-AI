import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    // Initial set avoiding cascading render by running after paint
    const timeoutId = setTimeout(() => {
       setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }, 0);
    
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    return () => {
       mql.removeEventListener("change", onChange);
       clearTimeout(timeoutId);
    }
  }, [])

  return !!isMobile
}
