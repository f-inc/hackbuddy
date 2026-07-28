import { NextResponse } from "next/server";

export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 400, "VALIDATION_ERROR", options);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication is required.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 404, "NOT_FOUND", options);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 409, "CONFLICT", options);
  }
}

export class UpstreamError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 502, "UPSTREAM_ERROR", options);
  }
}

export class ConfigurationError extends AppError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 500, "CONFIGURATION_ERROR", options);
  }
}

export function errorResponse(
  error: unknown,
  fallback = "The request could not be completed.",
) {
  if (error instanceof AppError) {
    if (error.status >= 500) console.error(error);
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }

  console.error(error);
  return NextResponse.json(
    { error: fallback, code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
