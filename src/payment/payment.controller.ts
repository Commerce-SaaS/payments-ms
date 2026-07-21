import { Controller, Logger } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { PaymentService } from './payment.service';
import { PAYMENT_PATTERNS } from './patterns/payment_patterns';
import { CreatePaymentSessionDto } from './dto/create-payment-session.dto';
import { PaymentsPaginationDto } from './dto/payments-pagination.dto';
import { CancelPaymentDto } from './dto/cancel-payment.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PaymentTotalsByMethodDto } from './dto/payment-totals-by-method.dto';
import { PaymentTotalsByMethodRangeDto } from './dto/payment-totals-by-method-range.dto';
import { ORDER_PATTERNS } from 'src/webhooks/patterns/order-patterns';

@Controller()
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

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

  @MessagePattern(PAYMENT_PATTERNS.UPDATE)
  update(@Payload() dto: UpdatePaymentDto) {
    return this.service.update(dto);
  }

  @MessagePattern(PAYMENT_PATTERNS.TOTALS_BY_METHOD)
  totalsByMethod(@Payload() dto: PaymentTotalsByMethodDto) {
    return this.service.totalsByMethod(dto);
  }

  @MessagePattern(PAYMENT_PATTERNS.TOTALS_BY_METHOD_RANGE)
  totalsByMethodRange(@Payload() dto: PaymentTotalsByMethodRangeDto) {
    return this.service.totalsByMethodRange(dto);
  }

  // Consumed from the payments event queue (rabbitmqPaymentEventQueue).
  // Emitted by orders-ms when an order transitions to CANCELLED.
  @EventPattern(ORDER_PATTERNS.ORDER_CANCELLED)
  async onOrderCancelled(
    @Payload() data: { orderId: string; organizationId: string },
  ) {

    console.log(`Received ORDER_CANCELLED event for orderId=${data?.orderId}, organizationId=${data?.organizationId}`,
    );    
    try {
      await this.service.cancelOrderPayments(data);
    } catch (error) {
      // Log and swallow — a failure here must not crash the RabbitMQ consumer.
      this.logger.error(
        `order.cancelled: failed to cancel payments for orderId=${data?.orderId}: ${error?.message}`,
      );
    }
  }
}
