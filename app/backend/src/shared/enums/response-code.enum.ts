// Each code is its HTTP status multiplied by 10 (e.g. 401 Unauthorized -> '4010'),
// leaving a free digit for future sub-codes of the same status without colliding.
export enum ResponseCode {
  Ok = '2000',
  Created = '2010',
  NoContent = '2040',
  BadRequest = '4000',
  Unauthorized = '4010',
  Forbidden = '4030',
  NotFound = '4040',
  Conflict = '4090',
  UnprocessableEntity = '4220',
  TooManyRequests = '4290',
  InternalServerError = '5000',
}

// Derives a ResponseCode from a raw HTTP status (e.g. HttpException.getStatus())
// via the same "status * 10" rule, covering statuses not named above.
export function toResponseCode(httpStatus: number): ResponseCode {
  return String(httpStatus * 10) as ResponseCode;
}
