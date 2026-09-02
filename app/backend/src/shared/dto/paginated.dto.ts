import { ApiProperty } from '@nestjs/swagger';

/**
 * Pagination metadata lives INSIDE `ApiResponseDto.data`, not as a sibling of it.
 *
 * `ApiResponseDto` is a fixed envelope every module depends on and it has no meta
 * slot; adding one to serve a single endpoint would change a shared class for
 * everyone. So a paginated endpoint returns `ApiResponseDto<PaginatedDto<T>>`.
 *
 * `totalPages` is derivable from `total`/`limit`, but it is returned anyway: one
 * integer here prevents an off-by-one in every client that would otherwise compute
 * it, and the offline cache uses it to know whether more pages exist.
 */
export class PaginatedDto<T> {
  @ApiProperty({ isArray: true })
  readonly items: readonly T[];

  @ApiProperty({
    description: 'Total rows matching the filter, ignoring paging.',
  })
  readonly total: number;

  @ApiProperty()
  readonly page: number;

  @ApiProperty()
  readonly limit: number;

  @ApiProperty()
  readonly totalPages: number;

  private constructor(
    items: readonly T[],
    total: number,
    page: number,
    limit: number,
  ) {
    this.items = items;
    this.total = total;
    this.page = page;
    this.limit = limit;
    this.totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  }

  static of<T>(
    items: readonly T[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedDto<T> {
    return new PaginatedDto<T>(items, total, page, limit);
  }
}
