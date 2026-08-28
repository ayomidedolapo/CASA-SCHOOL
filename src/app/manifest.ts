import type {
  MetadataRoute,
} from "next";

export default function manifest():
  MetadataRoute.Manifest {
  return {
    id:
      "/scanner",
    name:
      "CASA School Scanner",
    short_name:
      "CASA Scanner",
    description:
      "CASA School identity-verified attendance scanner.",
    start_url:
      "/scanner",
    scope:
      "/scanner",
    display:
      "standalone",
    orientation:
      "portrait",
    background_color:
      "#f5f3ee",
    theme_color:
      "#0a0a0a",
    icons: [
      {
        src:
          "/casa-scanner-icon.svg",
        sizes:
          "any",
        type:
          "image/svg+xml",
        purpose:
          "any",
      },
      {
        src:
          "/casa-scanner-icon.svg",
        sizes:
          "any",
        type:
          "image/svg+xml",
        purpose:
          "maskable",
      },
    ],
  };
}