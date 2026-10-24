import React, { createContext, useContext, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const LayoutContext = createContext({
  wide: false,
  short: false,
  contentWidth: 390,
});
export const useAdaptiveLayout = () => useContext(LayoutContext);

// Measure the app window, including Web split windows, rather than a device model.
export default function AdaptiveLayout({
  children,
  hasNavigation,
}: React.PropsWithChildren<{ hasNavigation: boolean }>) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({
    width: window.width,
    height: window.height,
  });
  const width = size.width - insets.left - insets.right;
  const wide = width >= 700;
  const rail = wide && hasNavigation ? 88 : 0;
  return (
    <View
      style={{ flex: 1 }}
      onLayout={({ nativeEvent: { layout } }) => {
        setSize((current) =>
          current.width === layout.width && current.height === layout.height
            ? current
            : { width: layout.width, height: layout.height },
        );
      }}
    >
      <LayoutContext.Provider
        value={{
          wide,
          short: size.height - insets.top - insets.bottom < 600,
          contentWidth: width - rail,
        }}
      >
        <View
          style={{
            flex: 1,
            paddingLeft: insets.left,
            paddingRight: insets.right + rail,
          }}
        >
          {children}
        </View>
      </LayoutContext.Provider>
    </View>
  );
}
