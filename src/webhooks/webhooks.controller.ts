import { Controller } from '@nestjs/common';
import { EventPattern } from '@nestjs/microservices';
import { WebhooksService } from './webhooks.service';
import { WEB_HOOK_PATTERNS } from './patterns/webhook_patterns';
import { WebhookEvent } from './types/webhook-events.types';

@Controller()
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @EventPattern(WEB_HOOK_PATTERNS.WEB_HOOK)
  async handleEvent(event: WebhookEvent) {
    return this.webhooksService.handleEvent(event);
  }
}
