import { useCallback, useEffect, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

const COLLAPSE_AFTER_Y = 32;
const DIRECTION_TRAVEL = 12;
const TOP_EXPAND_Y = 10;

export function useTabBarMinimizeOnScroll(
  onCompactChange?: (compact: boolean) => void
) {
  const callback = useRef(onCompactChange);
  const lastOffset = useRef(0);
  const downwardTravel = useRef(0);
  const upwardTravel = useRef(0);
  const compact = useRef(false);

  callback.current = onCompactChange;

  const updateCompact = useCallback((next: boolean) => {
    if (compact.current === next) return;
    compact.current = next;
    callback.current?.(next);
  }, []);

  useEffect(
    () => () => {
      if (compact.current) callback.current?.(false);
    }, []
  );

  return useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offset = Math.max(0, event.nativeEvent.contentOffset.y);
      const delta = offset - lastOffset.current;
      lastOffset.current = offset;

      if (offset <= TOP_EXPAND_Y) {
        downwardTravel.current = 0;
        upwardTravel.current = 0;
        updateCompact(false);
        return;
      }

      if (Math.abs(delta) < 0.5) return;

      if (delta > 0) {
        downwardTravel.current += delta;
        upwardTravel.current = 0;
        if (
          offset >= COLLAPSE_AFTER_Y &&
          downwardTravel.current >= DIRECTION_TRAVEL
        ) {
          downwardTravel.current = 0;
          updateCompact(true);
        }
      } else {
        upwardTravel.current -= delta;
        downwardTravel.current = 0;
        if (upwardTravel.current >= DIRECTION_TRAVEL) {
          upwardTravel.current = 0;
          updateCompact(false);
        }
      }
    },
    [updateCompact]
  );
}
