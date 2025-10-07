declare global {
  namespace Express {
    interface Request {
      userId?: string;
      user?: {
        id: string;
        email: string;
        name: string | null;
        role: string;
        isActive: boolean;
        verified: boolean;
      };
      spaceId?: string;
      roles?: string[];
      participant?: {
        id: string;
        runId: string;
        userId?: string;
        roleId?: string;
        roleName?: string;
        metadata?: any;
      };
    }
  }
}

export {};
