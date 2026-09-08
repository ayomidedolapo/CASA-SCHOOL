export class SchoolOperationsError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    status = 400,
    code = "SCHOOL_OPERATIONS_ERROR",
  ) {
    super(message);
    this.name = "SchoolOperationsError";
    this.status = status;
    this.code = code;
  }
}
