import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(email: string, password: string) {
    // TODO: Validate credentials against database
    // TODO: Compare hashed password with bcrypt
    const payload = { sub: 'user-id', email };
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' }),
    };
  }

  async register(email: string, password: string, name: string) {
    // TODO: Check if user already exists
    // TODO: Hash password with bcrypt
    // TODO: Create user in database
    // TODO: Create default tenant for user
    const payload = { sub: 'new-user-id', email };
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' }),
    };
  }

  async refresh(refreshToken: string) {
    // TODO: Verify refresh token
    // TODO: Check if token is revoked
    try {
      const payload = this.jwtService.verify(refreshToken);
      const newPayload = { sub: payload.sub, email: payload.email };
      return {
        accessToken: this.jwtService.sign(newPayload),
        refreshToken: this.jwtService.sign(newPayload, { expiresIn: '7d' }),
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
