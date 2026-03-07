import { HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

export class RpcExceptionHelper {
  static handle(error: any): never {
    if (error instanceof RpcException) {
      throw error;
    }

    if (error.code === '23505') {
      throw new RpcException({
        code: 'DUPLICATE_ENTRY',
        message: 'Duplicate entry',
        statusCode: HttpStatus.CONFLICT,
      });
    }

    throw new RpcException({
      code: 'INTERNAL_ERROR',
      message: error.detail || error.message || 'Internal server error',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }

  static duplicate(code: string, entity: string): never {
    throw new RpcException({
      code,
      message: `Duplicate entry: ${entity} already exists`,
      statusCode: HttpStatus.CONFLICT,
    });
  }

  static notFound(code: string, entity: string): never {
    throw new RpcException({
      code,
      message: `${entity} not found`,
      statusCode: HttpStatus.NOT_FOUND,
    });
  }

  static forbidden(code: string, message: string): never {
    throw new RpcException({
      code,
      message,
      statusCode: HttpStatus.FORBIDDEN,
    });
  }

  static badRequest(code: string, message: string): never {
    throw new RpcException({
      code,
      message,
      statusCode: HttpStatus.BAD_REQUEST,
    });
  }

  static internal(code: string, message: string): never {
    throw new RpcException({
      code,
      message,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    });
  }
}
