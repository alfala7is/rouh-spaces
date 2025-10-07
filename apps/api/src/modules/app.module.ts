import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
import { TemplatesModule } from './templates/templates.module';
import { CoordinationModule } from './coordination/coordination.module';
import { BlueprintsModule } from './blueprints/blueprints.module';
import { HealthController } from '../health.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100
    }]),
    ItemsModule,
    SourcesModule,
    ActionsModule,
    LedgerModule,
    SpacesModule,
    AuthModule,
    AiModule,
    TemplatesModule,
    CoordinationModule,
    BlueprintsModule
  ],
  providers: [
    PrismaService,
    EventsGateway,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SpaceIdMiddleware).forRoutes('*');
  }
}
