import { Controller } from "@nestjs/common";
import { StripeConnectService } from "./stripe-connect.service";
import { MessagePattern, Payload } from "@nestjs/microservices";
import { UserContext } from "src/common/dto/current-user-context.type";

const STRIPE_CONNECT_PATTERNS = {
  CONNECT_ACCOUNT: 'stripe.connect.account',
} as const;

@Controller()
export class StripeConnectController {
  constructor(private readonly service: StripeConnectService) {}

  @MessagePattern(STRIPE_CONNECT_PATTERNS.CONNECT_ACCOUNT)
  async createConnectSession(@Payload() user: UserContext) {
    return this.service.connectAccount(user);
  }

}
