import type {
  Metadata,
  Viewport,
} from "next";

import "@aws-amplify/ui-react/styles.css";

import ScannerInstallControl from "./scanner-install-control";

export const metadata:
  Metadata = {
  title:
    "CASA",
  description:
    "Identity-verified attendance terminal.",
  manifest:
    "/scanner/manifest.webmanifest",
  robots: {
    index: false,
    follow: false,
  },
  appleWebApp: {
    capable: true,
    title:
      "CASA",
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
  return (
    <>
      <ScannerInstallControl />
      {children}
    </>
  );
}