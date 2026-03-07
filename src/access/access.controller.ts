import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { AccessService } from './access.service';
import { ACCESS_PATTERNS } from './dto/patterns/access_patterns';


@Controller()
export class AccessController {
  constructor(private readonly service: AccessService) {}

  @MessagePattern(ACCESS_PATTERNS.CHECK)
  async check(data: { organizationId: string }) {
    return this.service.checkAccess(data.organizationId);
  }
}
