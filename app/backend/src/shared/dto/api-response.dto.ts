import { ApiProperty } from '@nestjs/swagger';
import { ResponseCode } from '../enums/response-code.enum';

export class ApiResponseDto<T = undefined> {
  @ApiProperty()
  readonly status: boolean;

  @ApiProperty({ enum: ResponseCode })
  readonly code: ResponseCode;

  @ApiProperty()
  readonly message: string;

  @ApiProperty({ required: false })
  readonly data?: T;

  private constructor(
    status: boolean,
    code: ResponseCode,
    message: string,
    data?: T,
  ) {
    this.status = status;
    this.code = code;
    this.message = message;
    this.data = data;
  }

  static success<T = undefined>(
    message: string,
    data?: T,
    code: ResponseCode = ResponseCode.Ok,
  ): ApiResponseDto<T> {
    return new ApiResponseDto<T>(true, code, message, data);
  }

  static error<T = undefined>(
    message: string,
    code: ResponseCode = ResponseCode.BadRequest,
    data?: T,
  ): ApiResponseDto<T> {
    return new ApiResponseDto<T>(false, code, message, data);
  }
}
