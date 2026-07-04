import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const userWithRolesInclude = {
  userRoles: {
    include: {
      role: {
        include: {
          rolePermissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
} as const;

export type UserWithRoles = NonNullable<
  Awaited<ReturnType<UsersService['findByEmailWithRoles']>>
>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmailWithRoles(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: userWithRolesInclude,
    });
  }

  findByIdWithRoles(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: userWithRolesInclude,
    });
  }
}
