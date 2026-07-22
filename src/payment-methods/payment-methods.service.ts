import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod } from './entities/payment-method.entity';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { PaginationPaymentMethodDto } from './dto/pagination-payment-method.dto';
import { RpcExceptionHelper } from 'src/common/helpers/rpc-exception.helper';
import { PaymentMethodErrorCode } from './enums/payment-method-error-code.enum';

@Injectable()
export class PaymentMethodsService {
  private readonly logger = new Logger(PaymentMethodsService.name);

  constructor(
    @InjectRepository(PaymentMethod)
    private readonly repo: Repository<PaymentMethod>,
  ) {}

  // ─── Create ───────────────────────────────────────────────────

  async create(dto: CreatePaymentMethodDto) {
    this.logger.log(
      `Creating payment method [organizationId=${dto.organizationId}]`,
    );

    try {
      const method = this.repo.create({ ...dto, isSystem: false });
      return await this.repo.save(method);
    } catch (error: any) {
      this.logger.error(`Error creating payment method: ${error.message}`);
      RpcExceptionHelper.handle(error);
    }
  }

  // ─── Find All ─────────────────────────────────────────────────

  async findAll(dto: PaginationPaymentMethodDto) {
    const {
      organizationId,
      offset = 0,
      limit = 20,
      search,
      withDeleted = false,
    } = dto;

    this.logger.log(
      `Fetching payment methods [organizationId=${organizationId}]`,
    );

    const qb = this.repo
      .createQueryBuilder('pm')
      .where('pm.organizationId = :organizationId', { organizationId });

    if (search) {
      qb.andWhere('pm.name ILIKE :search', { search: `%${search}%` });
    }

    if (withDeleted) qb.withDeleted();

    qb.orderBy('pm.sortOrder', 'ASC')
      .addOrderBy('pm.createdAt', 'ASC')
      .skip(offset)
      .take(limit);

    const [items, totalItems] = await qb.getManyAndCount();

    return {
      items,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      currentPage: Math.floor(offset / limit) + 1,
      hasMore: offset + limit < totalItems,
    };
  }

  // ─── Find One ─────────────────────────────────────────────────

  async findOne(id: string, organizationId: string) {
    this.logger.log(`Fetching payment method [id=${id}]`);

    const method = await this.repo.findOneBy({ id });

    if (!method) {
      RpcExceptionHelper.notFound(
        PaymentMethodErrorCode.PAYMENT_METHOD_NOT_FOUND,
        'PaymentMethod',
      );
    }

    if (method.organizationId !== organizationId) {
      RpcExceptionHelper.forbidden(
        PaymentMethodErrorCode.PAYMENT_METHOD_FORBIDDEN,
        'You do not have access to this payment method',
      );
    }

    return method;
  }

  // ─── Update ───────────────────────────────────────────────────

  async update(
    id: string,
    dto: UpdatePaymentMethodDto,
    organizationId: string,
  ) {
    this.logger.log(`Updating payment method [id=${id}]`);

    const method = await this.repo.findOneBy({ id });

    if (!method) {
      RpcExceptionHelper.notFound(
        PaymentMethodErrorCode.PAYMENT_METHOD_NOT_FOUND,
        'PaymentMethod',
      );
    }

    if (method.organizationId !== organizationId) {
      RpcExceptionHelper.forbidden(
        PaymentMethodErrorCode.PAYMENT_METHOD_FORBIDDEN,
        'You do not have access to this payment method',
      );
    }

    if (method.isSystem && dto.isActive === false) {
      RpcExceptionHelper.badRequest(
        PaymentMethodErrorCode.PAYMENT_METHOD_SYSTEM,
        'System payment methods cannot be deactivated',
      );
    }

    if (dto.name && dto.name !== method.name) {
      const existing = await this.repo.findOne({
        where: { organizationId, name: dto.name },
      });

      if (existing) {
        RpcExceptionHelper.duplicate(
          PaymentMethodErrorCode.PAYMENT_METHOD_DUPLICATE,
          'PaymentMethod',
        );
      }
    }
    try {
      await this.repo.update(id, dto);
      return await this.repo.findOneBy({ id });
    } catch (error: any) {
      this.logger.error(`Error updating payment method: ${error.message}`);
      RpcExceptionHelper.handle(PaymentMethodErrorCode.PAYMENT_METHOD_FAILED);
    }
  }

  // ─── Soft Delete ──────────────────────────────────────────────

  async softDelete(id: string, organizationId: string) {
    this.logger.log(`Soft deleting payment method [id=${id}]`);

    const method = await this.repo.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!method) {
      RpcExceptionHelper.notFound(
        PaymentMethodErrorCode.PAYMENT_METHOD_NOT_FOUND,
        'PaymentMethod',
      );
    }

    if (method.organizationId !== organizationId) {
      RpcExceptionHelper.forbidden(
        PaymentMethodErrorCode.PAYMENT_METHOD_FORBIDDEN,
        'You do not have access to this payment method',
      );
    }

    if (method.isSystem) {
      RpcExceptionHelper.badRequest(
        PaymentMethodErrorCode.PAYMENT_METHOD_SYSTEM,
        'System payment methods cannot be deleted',
      );
    }

    if (method.deletedAt !== null) {
      RpcExceptionHelper.badRequest(
        PaymentMethodErrorCode.PAYMENT_METHOD_ALREADY_DELETED,
        'Payment method is already deleted',
      );
    }

    try {
      await this.repo.softDelete(id);
      return { message: 'Payment method deleted successfully' };
    } catch (error: any) {
      this.logger.error(`Error deleting payment method: ${error.message}`);
      RpcExceptionHelper.handle(PaymentMethodErrorCode.PAYMENT_METHOD_FAILED);
    }
  }

  // ─── Restore ──────────────────────────────────────────────────

  async restore(id: string, organizationId: string) {
    this.logger.log(`Restoring payment method [id=${id}]`);

    const method = await this.repo.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!method) {
      RpcExceptionHelper.notFound(
        PaymentMethodErrorCode.PAYMENT_METHOD_NOT_FOUND,
        'PaymentMethod',
      );
    }

    if (method.organizationId !== organizationId) {
      RpcExceptionHelper.forbidden(
        PaymentMethodErrorCode.PAYMENT_METHOD_FORBIDDEN,
        'You do not have access to this payment method',
      );
    }

    if (method.deletedAt === null) {
      RpcExceptionHelper.badRequest(
        PaymentMethodErrorCode.PAYMENT_METHOD_NOT_DELETED,
        'Payment method is not deleted',
      );
    }

    try {
      await this.repo.restore(id);
      return await this.repo.findOneBy({ id });
    } catch (error: any) {
      this.logger.error(`Error restoring payment method: ${error.message}`);
      RpcExceptionHelper.handle(PaymentMethodErrorCode.PAYMENT_METHOD_FAILED);
    }
  }
}
