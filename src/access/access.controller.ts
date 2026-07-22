import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { AccessService } from './access.service';
import { ACCESS_PATTERNS } from './dto/patterns/access_patterns';


@Controller()
export class AccessController {
  constructor(private readonly service: AccessService) {}

  @MessagePattern(ACCESS_PATTERNS.CHECK)
  async check(data: { userId: string }) {
    return this.service.checkAccess(data.userId);
  }

  @MessagePattern(ACCESS_PATTERNS.CHECK_ONBOARDING)
  async checkOnboarding(data: { userId: string }) {
    return this.service.checkOnboarding(data.userId);
  }
}
