import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { correlationIdStorage } from './correlation-id.context';

const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Correlation-ID propagation (ADR-0027). Every request gets a correlationId —
 * reused from an inbound header if the caller already has one (e.g. a retried
 * client request, or a call chained from another internal service), otherwise
 * minted here. Stored in AsyncLocalStorage so any code on this request's async
 * call stack — including the eventual `platform.outbox` row a request's
 * handler writes — can read it without threading it through every function
 * signature by hand.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId = (req.headers[CORRELATION_ID_HEADER] as string | undefined) ?? randomUUID();
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    correlationIdStorage.run({ correlationId }, () => next());
  }
}
