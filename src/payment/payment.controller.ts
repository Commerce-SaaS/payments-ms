import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { PaymentService } from './payment.service';
import { PAYMENT_PATTERNS } from './patterns/payment_patterns';
import { CreatePaymentSessionDto } from './dto/create-payment-session.dto';

@Controller()
export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  @MessagePattern(PAYMENT_PATTERNS.CREATE_PAYMENT_SESSION)
  async createPaymentSession(data: CreatePaymentSessionDto) {
    return this.service.createPaymentSession(data);
  }

}
