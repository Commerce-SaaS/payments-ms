import { Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { AccessController } from './access.controller';
import { SubscriptionModule } from 'src/subscription/subscription.module';

@Module({
  imports: [SubscriptionModule],
  controllers: [AccessController],
  providers: [AccessService],
})
export class AccessModule {}
