import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export const fail = (status: number, code: string, message: string): never => { throw new ApiError(status, code, message); };

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error && typeof error === 'object' && 'status' in error && (error.status === 400 || error.status === 413)) {
    res.status(error.status).json({ code: 'VALIDATION', message: error.status === 413 ? 'Request body is too large.' : 'Invalid JSON body.' }); return;
  }
  if (error instanceof ZodError) {
    res.status(422).json({ code: 'VALIDATION', message: 'Invalid request.', fieldErrors: Object.fromEntries(error.issues.map(i => [i.path.join('.'), i.message])) });
    return;
  }
  if (error instanceof ApiError) { res.status(error.status).json({ code: error.code, message: error.message }); return; }
  if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) {
    res.status(409).json({ code: 'CONFLICT', message: 'This resource changed. Refresh and try again.' }); return;
  }
  // The database, stack, and provider messages stay in server logs.
  console.error(error);
  res.status(503).json({ code: 'TEMPORARY', message: 'The service is temporarily unavailable.' });
};
