import { HttpStatus } from '@api/routes/index.router';

export class BadRequestException {
  constructor(...objectError: any[]) {
    console.error('BadRequestException:', ...objectError);
    throw {
      status: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: objectError.length > 0 ? objectError : undefined,
    };
  }
}
