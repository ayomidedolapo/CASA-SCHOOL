export type HealthState =
  | "HEALTHY"
  | "DEGRADED";

export type DependencyHealthState =
  | "HEALTHY"
  | "UNAVAILABLE";

export interface CasaSchoolHealth {
  status: HealthState;
  application: {
    status: "HEALTHY";
  };
  database: {
    status: DependencyHealthState;
  };
  checkedAt: string;
}