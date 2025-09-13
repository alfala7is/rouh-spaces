import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { SpaceIdMiddleware } from '../shared/space.middleware';
import { SpacesModule } from './spaces/spaces.module';
import { ItemsModule } from './items/items.module';
import { SourcesModule } from './sources/sources.module';
import { ActionsModule } from './actions/actions.module';
import { LedgerModule } from './ledger/ledger.module';
import { EventsGateway } from './events.gateway';

@Module({
  imports: [SpacesModule, ItemsModule, SourcesModule, ActionsModule, LedgerModule],
  providers: [PrismaService, EventsGateway],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SpaceIdMiddleware).forRoutes('*');
  }
}

