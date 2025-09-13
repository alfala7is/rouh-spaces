import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class SpacesService {
  constructor(private prisma: PrismaService) {}

  async create(name: string, ownerId?: string) {
    return this.prisma.space.create({ data: { name, ownerId: ownerId ?? null } });
  }

  async findOne(spaceId: string) {
    // Read only; set_config to this space for RLS correctness
    return this.prisma.withSpaceTx(spaceId, async (tx) => {
      return tx.space.findUnique({ where: { id: spaceId } });
    });
  }
}

