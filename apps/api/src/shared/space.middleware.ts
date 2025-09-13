import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    spaceId?: string;
    userId?: string;
    roles?: string[];
  }
}

@Injectable()
export class SpaceIdMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    // Prefer header x-space-id; fallback to query
    const spaceId = (req.header('x-space-id') || (req.query['spaceId'] as string))?.toString();
    const userId = (req.header('x-user-id') || 'anon').toString();
    const roles = (req.header('x-roles') || '').toString().split(',').filter(Boolean);
    if (spaceId) req.spaceId = spaceId;
    req.userId = userId;
    req.roles = roles.length ? roles : ['seeker'];
    next();
  }
}

