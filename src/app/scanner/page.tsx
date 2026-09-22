import ScannerClient from "./scanner-client";

export const dynamic =
  "force-dynamic";
export const revalidate = 0;

export default function ScannerPage() {
  return <ScannerClient />;
}