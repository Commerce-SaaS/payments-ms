import { Type } from 'class-transformer';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class PaginationPaymentMethodDto {
  @IsUUID()
  organizationId: string;

  @IsOptional()
  @Min(0)
  @Type(() => Number)
  offset?: number;

  @IsOptional()
  @Min(1)
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  withDeleted?: boolean;
}