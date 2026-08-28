import type {
  Metadata,
  Viewport,
} from "next";

import "@aws-amplify/ui-react/styles.css";

export const metadata:
  Metadata = {
  title:
    "CASA School Scanner",
  description:
    "Identity-verified school attendance terminal.",
  manifest:
    "/manifest.webmanifest",
  robots: {
    index: false,
    follow: false,
  },
  appleWebApp: {
    capable: true,
    title:
      "CASA Scanner",
    statusBarStyle:
      "black-translucent",
  },
};

export const viewport:
  Viewport = {
  width:
    "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit:
    "cover",
  themeColor:
    "#0a0a0a",
};

export default function ScannerLayout(
  {
    children,
  }: Readonly<{
    children:
      React.ReactNode;
  }>,
) {
  return children;
}