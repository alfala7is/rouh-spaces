import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SpaceIdMiddleware } from '../shared/space.middleware';
import { ItemsModule } from './items/items.module';
import { SourcesModule } from './sources/sources.module';
import { ActionsModule } from './actions/actions.module';
import { LedgerModule } from './ledger/ledger.module';
import { EventsGateway } from './events.gateway';
import { SpacesModule } from './spaces/spaces.module';
import { AuthModule } from './auth/auth.module';
import { AiModule } from './ai/ai.module';
import { HealthController } from '../health.controller';

@Module({
  imports: [ItemsModule, SourcesModule, ActionsModule, LedgerModule, SpacesModule, AuthModule, AiModule],
  providers: [PrismaService, EventsGateway],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SpaceIdMiddleware).forRoutes('*');
  }
}
