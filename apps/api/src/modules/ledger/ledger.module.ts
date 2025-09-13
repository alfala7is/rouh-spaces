import { Module } from '@nestjs/common';
import { LedgerController } from './ledger.controller';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [LedgerController],
  providers: [PrismaService],
})
export class LedgerModule {}

