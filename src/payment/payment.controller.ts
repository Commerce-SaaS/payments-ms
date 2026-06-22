import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PaymentService } from './payment.service';
import { PAYMENT_PATTERNS } from './patterns/payment_patterns';
import { CreatePaymentSessionDto } from './dto/create-payment-session.dto';
import { PaymentsPaginationDto } from './dto/payments-pagination.dto';
import { CancelPaymentDto } from './dto/cancel-payment.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Controller()
export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  @MessagePattern(PAYMENT_PATTERNS.CREATE_PAYMENT_SESSION)
  createPaymentSession(@Payload() data: CreatePaymentSessionDto) {
    return this.service.createPaymentSession(data);
  }

  @MessagePattern(PAYMENT_PATTERNS.CREATE)
  createPayment(@Payload() data: CreatePaymentDto) {
    return this.service.create(data);
  }

  @MessagePattern(PAYMENT_PATTERNS.FIND_ALL)
  findAll(@Payload() dto: PaymentsPaginationDto) {
    return this.service.findAll(dto);
  }

  @MessagePattern(PAYMENT_PATTERNS.FIND_MY)
  findMyPayments(@Payload() dto: PaymentsPaginationDto) {
    return this.service.findMyPayments(dto);
  }

  @MessagePattern(PAYMENT_PATTERNS.FIND_MY_BY_ID)
  findMyPaymentById(
    @Payload() dto: { id: string; organizationId: string; userId: string },
  ) {
    return this.service.findMyPaymentById(dto);
  }

  @MessagePattern(PAYMENT_PATTERNS.GET_BY_ID)
  findOne(@Payload() dto: { id: string; organizationId: string }) {
    return this.service.findOne(dto);
  }

  @MessagePattern(PAYMENT_PATTERNS.CANCEL)
  cancel(@Payload() dto: CancelPaymentDto) {
    return this.service.cancel(dto);
  }
}
