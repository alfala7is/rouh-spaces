import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

interface RegisterDto {
  email: string;
  password: string;
  name?: string;
}

interface LoginDto {
  email: string;
  password: string;
}

interface AuthResult {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    verified: boolean;
  };
  session: {
    token: string;
    expiresAt: Date;
  };
}

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async register(data: RegisterDto, userAgent?: string, ipAddress?: string): Promise<AuthResult> {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email.toLowerCase() }
    });

    if (existingUser) {
      throw new ConflictException('User already exists with this email');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 12);

    // Generate verification token
    const verifyToken = crypto.randomBytes(32).toString('hex');

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        name: data.name,
        hashedPassword,
        verifyToken,
        role: 'seeker', // Default role
      },
    });

    // Create session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        token: sessionToken,
        expiresAt,
        userAgent,
        ipAddress,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        verified: user.verified,
      },
      session: {
        token: session.token,
        expiresAt: session.expiresAt,
      },
    };
  }

  async login(data: LoginDto, userAgent?: string, ipAddress?: string): Promise<AuthResult> {
    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: data.email.toLowerCase() }
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(data.password, user.hashedPassword);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Clean up expired sessions for this user
    await this.prisma.userSession.deleteMany({
      where: {
        userId: user.id,
        expiresAt: { lte: new Date() },
      },
    });

    // Create new session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        token: sessionToken,
        expiresAt,
        userAgent,
        ipAddress,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        verified: user.verified,
      },
      session: {
        token: session.token,
        expiresAt: session.expiresAt,
      },
    };
  }

  async validateSession(token: string): Promise<any> {
    const session = await this.prisma.userSession.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            verified: true,
          },
        },
      },
    });

    if (!session || session.expiresAt < new Date() || !session.user.isActive) {
      // Clean up expired or invalid session
      if (session) {
        await this.prisma.userSession.delete({
          where: { id: session.id },
        });
      }
      return null;
    }

    return {
      user: session.user,
      session: {
        id: session.id,
        token: session.token,
        expiresAt: session.expiresAt,
      },
    };
  }

  async logout(token: string): Promise<void> {
    await this.prisma.userSession.delete({
      where: { token },
    }).catch(() => {
      // Session might already be deleted, ignore error
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.userSession.deleteMany({
      where: { userId },
    });
  }

  async getCurrentUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        verified: true,
        createdAt: true,
      },
    });
  }

  async updateUser(userId: string, data: { name?: string; email?: string }) {
    // Check if email is already taken (if changing email)
    if (data.email) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          email: data.email.toLowerCase(),
          NOT: { id: userId },
        },
      });

      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.email && { email: data.email.toLowerCase(), verified: false }), // Reset verification if email changes
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        verified: true,
        createdAt: true,
      },
    });
  }
}