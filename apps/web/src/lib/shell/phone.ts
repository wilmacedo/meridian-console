// The phone layout is for a page narrower than this, in the interface's own pixels. CarPlay has its own layout and
// takes precedence, and a phone turned sideways is wider than this, so it gets the desktop one.
export const PHONE_BELOW = 600

export const phoneFor = (width: number, carplay: boolean): boolean => !carplay && width < PHONE_BELOW
