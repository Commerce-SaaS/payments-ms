import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { PaymentMethodsService } from './payment-methods.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { PaginationPaymentMethodDto } from './dto/pagination-payment-method.dto';
import { PAYMENT_METHOD_PATTERNS } from './patterns/payment-method.patterns';


@Controller()
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @MessagePattern(PAYMENT_METHOD_PATTERNS.CREATE)
  create(@Payload() dto: CreatePaymentMethodDto) {
    return this.paymentMethodsService.create(dto);
  }

  @MessagePattern(PAYMENT_METHOD_PATTERNS.FIND_ALL)
  findAll(@Payload() dto: PaginationPaymentMethodDto) {
    return this.paymentMethodsService.findAll(dto);
  }

  @MessagePattern(PAYMENT_METHOD_PATTERNS.FIND_ONE)
  findOne(@Payload() payload: { id: string; organizationId: string }) {
    return this.paymentMethodsService.findOne(payload.id, payload.organizationId);
  }

  @MessagePattern(PAYMENT_METHOD_PATTERNS.UPDATE)
  update(@Payload() payload: { id: string; organizationId: string; dto: UpdatePaymentMethodDto }) {
    return this.paymentMethodsService.update(payload.id, payload.dto, payload.organizationId);
  }

  @MessagePattern(PAYMENT_METHOD_PATTERNS.SOFT_DELETE)
  softDelete(@Payload() payload: { id: string; organizationId: string }) {
    return this.paymentMethodsService.softDelete(payload.id, payload.organizationId);
  }

  @MessagePattern(PAYMENT_METHOD_PATTERNS.RESTORE)
  restore(@Payload() payload: { id: string; organizationId: string }) {
    return this.paymentMethodsService.restore(payload.id, payload.organizationId);
  }
}