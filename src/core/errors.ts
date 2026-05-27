export class DwgCliError extends Error {
  constructor(
    message: string,
    readonly code = "DWG_ERROR",
    readonly exitCode = 1,
  ) {
    super(message);
    this.name = "DwgCliError";
  }
}
