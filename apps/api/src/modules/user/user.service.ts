import { Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class UserService {
  async findById(id: string) {
    // TODO: Query user from database using Prisma
    return { id, email: 'user@example.com', name: 'User' };
  }

  async update(id: string, data: Record<string, unknown>) {
    // TODO: Update user in database using Prisma
    return { id, ...data };
  }

  async findByEmail(email: string) {
    // TODO: Query user by email from database
    return null;
  }
}
